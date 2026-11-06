import { liveWatchlist, telegram } from './commands.js';
import { matchDartCompany, kstDate } from './dart.js';
import { sharedDisclosureKey, claimDisclosure, finishDisclosure, releaseDisclosure } from './disclosure-dedup.js';

export const KIND_CRON = '*/1 * * * *';
const ORIGIN = 'https://kind.krx.co.kr';
const IPO = '/listinvstg/listinvstgcom.do';
const DISC = '/disclosure/todaydisclosure.do';
const statuses = { '01': '청구서접수', '02': '심사승인', '04': '심사철회' };
// Prefer DART's detailed official filing over a matching KIND headline.
// KIND-only disclosures remain available after a bounded fallback window.
export const DART_PRIORITY_WAIT_MS = 30 * 60_000;
const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value);
const iso = now => kstDate(now).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
export function parseKind(html, type, selectedDate) {
  const total = html.match(/전체\s*<em>([\d,]+)<\/em>건\s*:\s*<strong>\d+<\/strong>\s*\/\s*(\d+)/);
  if (!total || !html.includes('<table')) throw Error('KIND 목록 형식 변경 또는 잘못된 응답');
  const rows = [];
  for (const m of html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)) {
    const row = m[0], rawCells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(x => x[1]);
    const cells = rawCells.map(clean);
    for (const i of (type === 'ipo' ? [0] : [1,2])) {
      const title = rawCells[i]?.match(/\btitle=(?:"([^"]*)"|'([^']*)')/);
      if (title) cells[i] = clean(title[1] ?? title[2]);
    }
    if (type === 'ipo') {
      const id = row.match(/fnDetailView\(['"](\d{14})['"]\)/)?.[1];
      if (!id) continue;
      if (cells.length !== 6 || !date(cells[2]) || (cells[3] && !date(cells[3]))) throw Error('KIND 예비심사 행 해석 실패');
      const status = cells[4].replace(/\s/g, '');
      const eventDate = status === '청구서접수' ? cells[2] : cells[3];
      rows.push({ id, company: cells[0], market: row.match(/alt=['"]([^'"]+)['"]/)?.[1] || '', listing: cells[1], filed: cells[2], eventDate, status,
        url: ORIGIN + IPO + '?method=searchListInvstgCorpDetail&bizProcNo=' + id });
    } else {
      const id = row.match(/openDisclsViewer\(['"](\d{14})['"]/)?.[1];
      if (!id) continue;
      if (cells.length < 4 || !cells[2]) throw Error('KIND 공시 행 해석 실패');
      // Company icons are images, so their market labels do not enter the company name.
      rows.push({ id, company: cells[1], title: cells[2], eventDate: selectedDate,
        url: ORIGIN + '/common/disclsviewer.do?method=search&acptno=' + id + '&docno=&viewerhost=' });
    }
  }
  const count = Number(total[1].replaceAll(',', '')), pages = Number(total[2]);
  if ((count > 0 && !rows.length) || rows.length !== [...html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].filter(m => /<td\b/i.test(m[0]) && !/colspan=/i.test(m[0])).length) throw Error('KIND 공시/예비심사 항목 해석 실패');
  return { rows, pages, count };
}

async function getPage(source, number, now, fetcher) {
  const selectedDate = iso(now - (source === 'previous' ? 86400000 : 0));
  const ipo = source.startsWith('ipo:');
  const code = source.slice(4);
  const params = new URLSearchParams({ method: ipo ? 'searchListInvstgCorpSub' : 'searchTodayDisclosureSub',
    forward: ipo ? 'listinvstgcom_sub' : 'todaydisclosure_sub', currentPageSize: '100', pageIndex: String(number),
    orderMode: ipo ? (code === '01' ? '2' : '3') : '0', orderStat: 'D', marketType: '' });
  if (ipo) {
    params.set('fromDate', '2000-01-01'); params.set('toDate', iso(now));
    params.set('listTypeArrStr', '01|02|03|04|05|06|07|'); params.set('invstgRsltArrStr', code + '|');
  } else {
    params.set('selDate', selectedDate); params.set('todayFlag', 'N'); params.set('chose', '');
    for (const key of ['searchMode','searchCodeType','repIsuSrtCd','kosdaqSegment','searchCorpName']) params.set(key, '');
  }
  let response;
  try { response = await fetcher(ORIGIN + (ipo ? IPO : DISC), { method: 'POST', body: params.toString(), redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'telegram-stock-news-alert/1.0 (KIND client)' }, signal: AbortSignal.timeout(12000) }); }
  catch { throw Error('KIND 연결 실패'); }
  if (!response.ok) throw Error('KIND HTTP ' + response.status);
  return parseKind(await response.text(), ipo ? 'ipo' : 'disclosure', selectedDate);
}

export async function collectKind(source, now, fetcher = fetch) {
  const items = [], cutoff = iso(now - 2 * 86400000);
  for (let p = 1; p <= 10; p++) {
    const result = await getPage(source, p, now, fetcher);
    if (source.startsWith('ipo:')) {
      const wanted = statuses[source.slice(4)];
      if (result.rows.some(row => row.status !== wanted || !row.eventDate)) throw Error('KIND 심사상태 필터 검증 실패');
      items.push(...result.rows.filter(row => row.eventDate >= cutoff));
      // Result date (or filing date for receipt) descending is the site's own ordering.
      if (result.rows.some(row => row.eventDate < cutoff)) return items;
    } else items.push(...result.rows);
    if (p >= result.pages) return items;
  }
  throw Error('KIND 10페이지 초과: 수집 범위 점검 필요');
}

export function kindMessage(item) {
  if (item.status) return '[상장예비심사 · ' + item.status + '] ' + item.company + '\n'
    + item.market + ' · ' + item.listing + '\n청구일: ' + item.filed + '\n'
    + (item.status === '청구서접수' ? '' : '결과확정일: ' + item.eventDate + '\n') + item.url;
  return '[KIND 공시] [' + item.ticker + '] ' + item.title + '\n공시일: ' + item.eventDate + '\n' + item.url;
}

export async function runKindCheck(env, scheduledAt = Date.now(), options = {}) {
  const source = ['today', 'previous', 'ipo:01', 'ipo:02', 'ipo:04'][Math.floor(scheduledAt / 60000) % 5];
  const now = options.now ?? Date.now(), owner = crypto.randomUUID();
  const lock = await env.DB.prepare('UPDATE kind_runtime SET lock_owner=?, lock_until_ms=? WHERE id=1 AND lock_until_ms < ? RETURNING id')
    .bind(owner, now + 240000, now).first();
  if (!lock) return { skipped: true };
  try {
    const companies = await liveWatchlist(env);
    const prior = await env.DB.prepare('SELECT initialized_ms FROM kind_sources WHERE source=?').bind(source).first();
    const items = await (options.collector || collectKind)(source, now);
    const subscriptions = (await env.DB.prepare('SELECT ticker, source FROM kind_topics').all()).results || [];
    const ready = new Set(subscriptions.filter(row => row.source === source).map(row => row.ticker));
    // Exact aliases only; IPO status notices deliberately cover all companies.
    const selected = items.map(item => item.status ? item : { ...item, ticker: matchDartCompany(item.company, companies) })
      .filter(item => item.status || item.ticker);
    const writes = [];
    for (const item of selected) {
      const key = item.status ? item.id + ':' + item.status + ':' + item.eventDate : 'disclosure:' + item.id;
      const baseline = !prior?.initialized_ms || (!item.status && !ready.has(item.ticker));
      writes.push(env.DB.prepare('INSERT OR IGNORE INTO kind_items(event_key,receipt,ticker,body,event_date,sent_ms,created_ms) VALUES(?,?,?,?,?,?,?)')
        .bind(key, item.status ? null : item.id, item.ticker || null, kindMessage(item), item.eventDate, baseline ? now : null, now));
    }
    for (let i=0;i<writes.length;i+=25) await env.DB.batch(writes.slice(i,i+25));
    // Each watchlist company baselines today and yesterday independently.
    if (!source.startsWith('ipo:')) {
      const topics = [...companies.keys()].map(ticker => env.DB.prepare('INSERT OR IGNORE INTO kind_topics(ticker,source) VALUES(?,?)').bind(ticker,source));
      for (let i=0;i<topics.length;i+=25) await env.DB.batch(topics.slice(i,i+25));
    }
    for (const {ticker} of subscriptions) if (!companies.has(ticker)) await env.DB.batch([
      env.DB.prepare('DELETE FROM kind_topics WHERE ticker=?').bind(ticker),
      env.DB.prepare('UPDATE kind_items SET sent_ms=? WHERE ticker=? AND sent_ms IS NULL').bind(now,ticker)
    ]);
    await env.DB.prepare('INSERT INTO kind_sources(source,initialized_ms,last_checked_ms,last_count,last_error) VALUES(?,?,?,?,NULL) ON CONFLICT(source) DO UPDATE SET initialized_ms=COALESCE(kind_sources.initialized_ms,excluded.initialized_ms),last_checked_ms=excluded.last_checked_ms,last_count=excluded.last_count,last_error=NULL')
      .bind(source,now,now,selected.length).run();
    let sent = 0;
    const pending = (await env.DB.prepare('SELECT * FROM kind_items WHERE sent_ms IS NULL ORDER BY created_ms,event_key LIMIT 5').all()).results || [];
    for (const item of pending) {
      if ((await env.DB.prepare('SELECT paused FROM bot_runtime WHERE id=1').first()).paused) break;
      if (item.ticker && !(await liveWatchlist(env)).has(item.ticker)) {
        await env.DB.prepare('UPDATE kind_items SET sent_ms=? WHERE event_key=?').bind(now,item.event_key).run(); continue;
      }
      // Prefer DART's readable original filing if it is about to arrive.
      // Ordinary contracts, IPO status and other non-shared disclosures have no delay.
      const title = item.body.split('\n')[0].replace(/^\[KIND 공시\]\s*\[[^\]]+\]\s*/,'');
      const eventKey = item.ticker && sharedDisclosureKey({
        ticker:item.ticker,title,date:item.event_date
      });
      const dart = item.receipt && await env.DB.prepare(
        'SELECT sent_ms FROM dart_filings WHERE receipt_no=?'
      ).bind(item.receipt).first();
      let alreadySent = Boolean(dart?.sent_ms);
      let matchingDartExists = Boolean(dart);
      if (eventKey) {
        // Compare all same-day DART filings, not only already-sent rows:
        // DART may be queued, fetching a body, or retrying after a failure.
        const rows = (await env.DB.prepare(
          'SELECT report_name,filed_date,sent_ms FROM dart_filings WHERE ticker=? AND filed_date=?'
        ).bind(item.ticker,item.event_date.replace(/-/g,'')).all()).results || [];
        const matches = rows.filter(row => sharedDisclosureKey({
          ticker:item.ticker,title:row.report_name,date:row.filed_date
        })===eventKey);
        if (matches.length) {
          matchingDartExists = true;
          alreadySent ||= matches.some(row=>row.sent_ms !== null);
        }
      }
      // If DART has this disclosure, KIND never sends its copy. While DART
      // is pending, let it retry rather than racing it with a KIND fallback.
      if (!alreadySent && eventKey && matchingDartExists) continue;
      // If only KIND has appeared, give DART a fair opportunity to arrive.
      // Without a matching DART record, a genuine KIND-only disclosure can
      // still reach the user after this bounded grace period.
      if (!alreadySent && eventKey && now-item.created_ms < DART_PRIORITY_WAIT_MS) continue;
      let claim=null;
      if (!alreadySent && eventKey) {
        claim=await claimDisclosure(env,eventKey,'kind',item.event_key,now);
        if (claim.status==='busy') continue;
        if (claim.status==='duplicate') alreadySent=true;
      }
      if (!alreadySent) {
        try {
          if (sent) await new Promise(r=>setTimeout(r,1100));
          await telegram(env,'sendMessage',{chat_id:env.TELEGRAM_CHAT_ID,text:item.body,link_preview_options:{is_disabled:false}});
          await finishDisclosure(env,claim,now);
          sent++;
        } catch(error) {
          await releaseDisclosure(env,claim);
          throw error;
        }
      }
      await env.DB.prepare('UPDATE kind_items SET sent_ms=? WHERE event_key=?').bind(now,item.event_key).run();
    }
    await env.DB.prepare('DELETE FROM kind_items WHERE sent_ms IS NOT NULL AND created_ms < ?').bind(now - 30*86400000).run();
    const summary = source + ' 확인 · 대상 ' + selected.length + '건 · 이번 발송 ' + sent + '건';
    await env.DB.prepare('UPDATE kind_runtime SET last_summary=? WHERE id=1').bind(summary).run();
    console.log('KIND ' + summary);
    return { source, sent, count:selected.length };
  } catch(error) {
    await env.DB.prepare('INSERT INTO kind_sources(source,last_error) VALUES(?,?) ON CONFLICT(source) DO UPDATE SET last_error=excluded.last_error')
      .bind(source,String(error.message).slice(0,200)).run();
    await env.DB.prepare('UPDATE kind_runtime SET last_summary=? WHERE id=1').bind('오류: '+source+' · '+String(error.message).slice(0,200)).run();
    throw error;
  } finally {
    await env.DB.prepare('UPDATE kind_runtime SET lock_owner=NULL,lock_until_ms=0 WHERE id=1 AND lock_owner=?').bind(owner).run();
  }
}
