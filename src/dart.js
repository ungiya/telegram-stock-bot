import { SUMMARY_MARKER } from './dart-summary.js';
import { fetchFilingBody, filingMessages } from './dart-body.js';
import { liveWatchlist, telegram } from './commands.js';
import { earningsDisclosureKey, claimDisclosure, finishDisclosure, releaseDisclosure } from './disclosure-dedup.js';

// Separate invocation from news; bounded to eight API pages and five sends per tick.
export const DART_CRON = '0-59 * * * *';
const MAX_PAGES = 8;
const MAX_SEND = 5;
const API = 'https://opendart.fss.or.kr/api/list.json';

export function dartCompanyName(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/주식회사|\(주\)|㈜/g, '').replace(/[^\p{L}\p{N}]/gu, '');
}
export function matchDartCompany(name, companies) {
  const target = dartCompanyName(name);
  if (!target) return null;
  for (const [ticker, aliases] of companies) {
    // Exact legal-name/alias matching prevents matching subsidiaries by substring.
    const names = ticker === '씨어스' ? [ticker, ...aliases, '씨어스테크놀로지'] : [ticker, ...aliases];
    if (names.some(alias => dartCompanyName(alias) === target)) return ticker;
  }
  return null;
}
export function kstDate(now) {
  return new Date(now + 9 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
}
export function normalizeFiling(row, companies) {
  const ticker = matchDartCompany(row.corp_name, companies);
  if (!ticker || !/^\d{14}$/.test(String(row.rcept_no)) || !/^\d{8}$/.test(String(row.rcept_dt))) return null;
  if (!String(row.report_nm || '').trim()) return null;
  return { receipt: String(row.rcept_no), ticker, company: String(row.corp_name), report: String(row.report_nm), date: String(row.rcept_dt) };
}
export function formatDartMessage(item) {
  const date = item.filed_date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  return '[공시] [' + item.ticker + '] ' + item.report_name.slice(0, 1000)
    + '\n접수일: ' + date + '\nhttps://dart.fss.or.kr/dsaf001/main.do?rcpNo=' + item.receipt_no;
}
async function page(env, pageNo, now) {
  const url = new URL(API);
  url.search = new URLSearchParams({ crtfc_key: String(env.DART_API_KEY).trim(), bgn_de: kstDate(now - 86400000),
    end_de: kstDate(now), last_reprt_at: 'N', sort: 'date', sort_mth: 'desc', page_count: '100', page_no: String(pageNo) });
  let response;
  const deadline = AbortSignal.timeout(10000);
  const originalQuery = url.search;
  let target = url;
  // Follow only HTTPS redirects back to this exact official API endpoint.
  // Never forward the API key to a login/error page or a different origin.
  for (let redirects = 0; ; redirects++) {
    try { response = await fetch(target.toString(), {
      method: 'GET', signal: deadline, redirect: 'manual',
      headers: { Accept: 'application/json', 'User-Agent': 'telegram-stock-news-alert/1.0 (OpenDART client)' },
    }); }
    catch { throw new Error('DART network request failed'); }
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get('Location');
    let next;
    try { next = new URL(location || '', target); } catch { /* Report only a redacted destination below. */ }
    const safe = next && next.origin === url.origin && next.pathname === url.pathname && !next.username && !next.password;
    if (!location || !safe) {
      // Exclude queries, credentials and reflected secret values from diagnostics.
      const key = String(env.DART_API_KEY).trim();
      const destination = next ? (next.protocol + '//' + next.hostname + next.pathname)
        .split(key).join('[redacted]').split(encodeURIComponent(key)).join('[redacted]')
        .replace(/[a-z0-9_-]{24,}/gi, '[redacted]').replace(/[\r\n]/g, '').slice(0, 180) : '(invalid location)';
      throw new Error('DART HTTP ' + response.status + ' redirect outside API: ' + destination);
    }
    if (redirects >= 2) throw new Error('DART redirect limit exceeded');
    next.search = originalQuery;
    next.hash = '';
    await response.body?.cancel();
    target = next;
  }
  if (!response.ok) throw new Error('DART HTTP status ' + response.status);
  let data;
  try { data = await response.json(); } catch { throw new Error('DART invalid JSON response'); }
  if (data.status === '013') return { rows: [], total: 1 };
  if (data.status !== '000') throw new Error('DART API status ' + String(data.status).slice(0, 10));
  if (!Array.isArray(data.list) || !Number.isInteger(Number(data.total_page)) || Number(data.total_page) < 1) throw new Error('DART invalid list response');
  return { rows: data.list, total: Number(data.total_page) };
}

// A single control request distinguishes query-specific failures from a failure
// of even the browser-equivalent API request. Never follow its redirect or use
// its rows as a baseline: its default date range differs from the collector.
export async function diagnoseDartRequest(env) {
  const url = new URL(API);
  url.search = new URLSearchParams({ crtfc_key: String(env.DART_API_KEY).trim(), page_count: '1' });
  try {
    const response = await fetch(url.toString(), {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json', 'User-Agent': 'telegram-stock-news-alert/1.0 (OpenDART client)' },
    });
    if (!response.ok) {
      await response.body?.cancel();
      return '최소 요청도 HTTP ' + response.status + ' (실행 환경의 API 연결 확인 필요)';
    }
    const data = await response.json();
    const status = /^\d{3}$/.test(String(data.status)) ? String(data.status) : 'unknown';
    if (status === '000' || status === '013') return '최소 요청 정상(API ' + status + '), 검색 조건을 포함한 요청만 실패';
    return '최소 요청 API ' + status;
  } catch { return '최소 요청도 연결 또는 응답 해석 실패'; }
}

async function collect(env, companies, now, state) {
  const topics = (await env.DB.prepare('SELECT ticker, initialized_at FROM dart_topics').all()).results || [];
  const ready = new Set(topics.filter(row => row.initialized_at !== null).map(row => row.ticker));
  const uninitialized = [...companies.keys()].filter(ticker => !ready.has(ticker));
  if (uninitialized.length) await env.DB.batch(uninitialized.map(ticker => env.DB.prepare(
    'INSERT OR IGNORE INTO dart_topics(ticker) VALUES (?)').bind(ticker)));
  // Scan the newest page every minute; resume the remaining pages after interruptions.
  // A rolling two-day window recovers filings around midnight and temporary outages.
  const added = uninitialized.some(ticker => !topics.some(row => row.ticker === ticker));
  let next = !added && state.next_page > 1 ? state.next_page : 2, total = 1, complete = false, fetched = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const number = i === 0 ? 1 : next;
    if (i > 0 && number > total) { complete = true; break; }
    const result = await page(env, number, now);
    fetched++;
    total = result.total;
    const filings = result.rows.map(row => normalizeFiling(row, companies)).filter(Boolean);
    if (filings.length) await env.DB.batch(filings.map(item => env.DB.prepare(
      'INSERT OR IGNORE INTO dart_filings(receipt_no,ticker,company_name,report_name,filed_date,discovered_ms,sent_ms) VALUES(?,?,?,?,?,?,?)'
    ).bind(item.receipt, item.ticker, item.company, item.report, item.date, now, ready.has(item.ticker) ? null : now)));
    if (number >= total) { complete = true; break; }
    if (i > 0) next = number + 1;
  }
  if (complete) {
    // Initial scan records existing filings without sending historical alerts.
    if (uninitialized.length) await env.DB.batch(uninitialized.map(ticker => env.DB.prepare(
      'UPDATE dart_topics SET initialized_at = ? WHERE ticker = ? AND initialized_at IS NULL').bind(now, ticker)));
    next = 1;
  }
  await env.DB.prepare('UPDATE dart_runtime SET next_page = ? WHERE id = 1').bind(next).run();
  return { fetched, complete };
}

export async function runDartCheck(env, now = Date.now()) {
  if (!env.DART_API_KEY) return { enabled: false, sent: 0 };
  if (!env.DB || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) throw new Error('DART required binding missing');
  const owner = crypto.randomUUID();
  const state = await env.DB.prepare('UPDATE dart_runtime SET lock_owner = ?, lock_until_ms = ? WHERE id = 1 AND lock_until_ms < ? RETURNING next_page')
    .bind(owner, now + 240000, now).first();
  if (!state) return { skipped: true, sent: 0 };
  try {
    const companies = await liveWatchlist(env);
    const collected = companies.size ? await collect(env, companies, now, state) : { fetched: 0, complete: true };
    // Remove stale subscriptions even when a ticker was removed while a scan ran.
    const current = await liveWatchlist(env);
    const topics = (await env.DB.prepare('SELECT ticker FROM dart_topics').all()).results || [];
    for (const { ticker } of topics) if (!current.has(ticker)) {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM dart_topics WHERE ticker = ?').bind(ticker),
        env.DB.prepare('UPDATE dart_filings SET sent_ms = ? WHERE ticker = ? AND sent_ms IS NULL').bind(now, ticker),
      ]);
    }
    let sent = 0, messageCount = 0;
    const paused = (await env.DB.prepare('SELECT paused FROM bot_runtime WHERE id = 1').first())?.paused;
    if (!paused && current.size) {
      const active = [...current.keys()], placeholders = active.map(() => '?').join(',');
      const pending = (await env.DB.prepare('SELECT * FROM dart_filings WHERE sent_ms IS NULL AND ticker IN (' + placeholders + ') ORDER BY receipt_no LIMIT ?')
        .bind(...active, MAX_SEND).all()).results || [];
      for (const item of pending) {
        // Recheck pause/removal before each external delivery.
        const runtime = await env.DB.prepare('SELECT paused FROM bot_runtime WHERE id = 1').first();
        if (runtime.paused) break;
        if (!(await liveWatchlist(env)).has(item.ticker)) continue;
        const eventKey=earningsDisclosureKey({
          ticker:item.ticker,title:item.report_name,date:item.filed_date
        });
        let claim=null;
        if(eventKey){
          // A legacy KIND alert may have been delivered before the shared
          // event table existed, including with a different receipt number.
          const kindRows=(await env.DB.prepare(
            'SELECT body,event_date FROM kind_items WHERE ticker=? AND event_date=? AND sent_ms IS NOT NULL'
          ).bind(item.ticker,item.filed_date.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3')).all()).results||[];
          const priorKind=kindRows.some(row=>{
            const title=row.body.split('\n')[0].replace(/^\[KIND 공시\]\s*\[[^\]]+\]\s*/,'');
            return earningsDisclosureKey({ticker:item.ticker,title,date:row.event_date})===eventKey;
          });
          if(priorKind){
            await env.DB.prepare('UPDATE dart_filings SET sent_ms=? WHERE receipt_no=?')
              .bind(now,item.receipt_no).run();
            continue;
          }
          claim=await claimDisclosure(env,eventKey,'dart',item.receipt_no,now);
          if(claim.status==='duplicate'){
            await env.DB.prepare('UPDATE dart_filings SET sent_ms=? WHERE receipt_no=?')
              .bind(now,item.receipt_no).run();
            continue;
          }
          if(claim.status==='busy')continue;
        }
        try {
        let delivery = await env.DB.prepare('SELECT * FROM dart_body_delivery WHERE receipt_no=?').bind(item.receipt_no).first();
        if (!delivery) {
          let body = '';
          try { body = await fetchFilingBody(env, item.receipt_no); }
          catch { console.warn('DART body unavailable', item.receipt_no); }
          const messages = filingMessages(item, body);
          await env.DB.prepare('INSERT OR IGNORE INTO dart_body_delivery(receipt_no,messages_json) VALUES(?,?)')
            .bind(item.receipt_no, JSON.stringify(messages)).run();
          delivery = await env.DB.prepare('SELECT * FROM dart_body_delivery WHERE receipt_no=?').bind(item.receipt_no).first();
        }
        let messages = JSON.parse(delivery.messages_json);
        if (!messages[0]?.includes('\n'+SUMMARY_MARKER+'\n')) {
          // Stop remaining legacy full-text parts already started. Do not resend
          // a summary of a filing the user has already received.
          if (delivery.next_part > 0) {
            await env.DB.prepare('UPDATE dart_filings SET sent_ms=? WHERE receipt_no=?').bind(now,item.receipt_no).run();
            continue;
          }
          const body = messages.map(message => {
            const start=message.indexOf('\n\n'), end=message.lastIndexOf('\n\n');
            return start>=0 && end>start ? message.slice(start+2,end) : '';
          }).join('');
          messages=filingMessages(item,body);
          await env.DB.prepare('UPDATE dart_body_delivery SET messages_json=? WHERE receipt_no=?').bind(JSON.stringify(messages),item.receipt_no).run();
        }
        let part = delivery.next_part;
        while (part < messages.length && messageCount < 6) {
          if ((await env.DB.prepare('SELECT paused FROM bot_runtime WHERE id=1').first()).paused || !(await liveWatchlist(env)).has(item.ticker)) break;
          // Renew the same invocation's ownership before every part.
          const lock = await env.DB.prepare('UPDATE dart_runtime SET lock_until_ms=? WHERE id=1 AND lock_owner=? RETURNING id')
            .bind(Date.now()+240000, owner).first();
          if (!lock) throw Error('DART delivery ownership lost');
          if (messageCount) await new Promise(resolve => setTimeout(resolve, 1100));
          await telegram(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text: messages[part], link_preview_options: { is_disabled: true } });
          part++; messageCount++;
          await env.DB.prepare('UPDATE dart_body_delivery SET next_part=? WHERE receipt_no=?').bind(part,item.receipt_no).run();
        }
        if (part < messages.length) break;
        await finishDisclosure(env,claim,now);
        await env.DB.prepare('UPDATE dart_filings SET sent_ms = ? WHERE receipt_no = ?').bind(now, item.receipt_no).run();
        sent++;
        } catch(error) {
          await releaseDisclosure(env,claim);
          throw error;
        }
        if (messageCount >= 6) break;
      }
    }
    const summary = 'DART 확인: ' + companies.size + '개 관심 종목 · 발송 ' + sent + '건' + (collected.complete ? '' : ' · 나머지 공시 목록 확인 중');
    await env.DB.prepare('UPDATE dart_runtime SET last_checked_ms = ?, last_summary = ? WHERE id = 1').bind(now, summary).run();
    // Keep 30 days of exact receipt-number deduplication history.
    await env.DB.prepare('DELETE FROM dart_filings WHERE sent_ms IS NOT NULL AND discovered_ms < ?').bind(now - 30 * 86400000).run();
    await env.DB.prepare('DELETE FROM dart_body_delivery WHERE receipt_no NOT IN (SELECT receipt_no FROM dart_filings)').run();
    console.log(summary);
    return { enabled: true, sent, ...collected };
  } catch (error) {
    if (error.message === 'DART HTTP 302 redirect outside API: https://opendart.fss.or.kr/error1.html') {
      error = new Error(error.message + ' · ' + await diagnoseDartRequest(env));
    }
    await env.DB.prepare('UPDATE dart_runtime SET last_summary = ? WHERE id = 1').bind('DART 오류: ' + error.message).run();
    throw error;
  } finally {
    await env.DB.prepare('UPDATE dart_runtime SET lock_owner = NULL, lock_until_ms = 0 WHERE id = 1 AND lock_owner = ?').bind(owner).run();
  }
}
