import { norm } from './filters.js';
import { liveWatchlist, telegram } from './commands.js';
import { REPORT_SOURCES, collectSource, reportDetail, requestBudget } from './report-collectors.js';

// Report processing has its own invocation/lock so it cannot spend the news tick's requests.
export const REPORT_CRON = '0-14 9,14,23 * * *';
export function reportSlot(scheduledAt) {
  const kst = new Date(scheduledAt + 9 * 3600000);
  return [8, 18, 23].includes(kst.getUTCHours()) && kst.getUTCMinutes() < 15
    ? kst.toISOString().slice(0, 10) + ':' + kst.getUTCHours() : null;
}
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function matchReport(item, companies, exact = false) {
  return reportMatcher(companies, exact)(item);
}
function reportMatcher(companies, exact) {
  const entries = [];
  const names = new Map();
  for (const [name, aliases] of companies) for (const alias of [name, ...aliases]) {
    const normalized = norm(alias);
    if (!normalized) continue;
    if (!names.has(normalized)) names.set(normalized, name);
    entries.push({ name, normalized, short: /^[a-z0-9]{1,3}$/i.test(alias) ? new RegExp('(^|[^a-z0-9])' + escape(alias) + '([^a-z0-9]|$)', 'i') : null });
  }
  return item => {
    if (exact) return names.get(norm(item.itemName || '')) || null;
    const text = norm(item.title);
    return entries.find(a => a.short ? a.short.test(item.title) : text.includes(a.normalized))?.name || null;
  };
}
async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, '0')).join('');
}
export async function reportSignature(company, item) {
  let title = String(item.title || '').replace(/^\([^)]*\)\s*/, '').replace(/^\[[^\]]*\]\s*/, '');
  title = title.replace(new RegExp(escape(company) + '\\s*\\([^)]*\\)\\s*[:：]?', 'i'), '')
    .replace(new RegExp('^' + escape(company) + '\\s*[:：]?', 'i'), '');
  return hash(norm(company) + '|' + norm(item.broker || '') + '|' + item.date + '|' + norm(title));
}
export function reportMessage(company, item) {
  let body = '[증권사 리포트] ' + company + '\n' + String(item.title).slice(0, 800) + '\n' + item.broker + ' | ' + item.date + '\n';
  if (item.opinion) body += '투자의견: ' + item.opinion + '\n';
  if (item.goalPrice) body += '목표주가: ' + item.goalPrice + '원\n';
  return body + item.url;
}
async function batch(env, statements) {
  for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));
}
async function recordSource(env, source, rows, companies, slot, now) {
  const state = await env.DB.prepare('SELECT initialized_ms FROM report_sources WHERE source = ?').bind(source).first();
  const { paused } = await env.DB.prepare('SELECT paused FROM bot_runtime WHERE id = 1').first();
  const suppressed = !state?.initialized_ms || paused ? 1 : 0;
  const matched = reportMatcher(companies, source === 'naver');
  const writes = [];
  for (const item of rows) {
    if (!item.title || !item.date || !item.url) continue;
    const id = source + ':' + (source === 'naver' ? item.id : await hash(item.url));
    const company = matched(item);
    // Record nonmatching reports too: adding a company must not resend historical reports.
    writes.push(env.DB.prepare('INSERT OR IGNORE INTO report_items (id, source, payload_json, ticker, suppressed, processed, discovered_ms) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, source, JSON.stringify(item), company, suppressed, company ? 0 : 1, now));
  }
  await batch(env, writes);
  await env.DB.prepare('INSERT INTO report_sources (source, initialized_ms, checked_slot, retry_after_ms, last_checked_ms, last_count, last_error) VALUES (?, ?, ?, 0, ?, ?, NULL) ON CONFLICT(source) DO UPDATE SET initialized_ms = COALESCE(report_sources.initialized_ms, excluded.initialized_ms), checked_slot = excluded.checked_slot, retry_after_ms = 0, last_checked_ms = excluded.last_checked_ms, last_count = excluded.last_count, last_error = NULL')
    .bind(source, now, slot, now, rows.length).run();
}
async function prepareAlerts(env, companies, request, now, paused) {
  const rows = await env.DB.prepare('SELECT * FROM report_items WHERE processed = 0 ORDER BY discovered_ms, id LIMIT 80').all();
  let details = 0;
  for (const row of rows.results || []) {
    if (!companies.has(row.ticker)) {
      await env.DB.prepare('UPDATE report_items SET processed = 1 WHERE id = ?').bind(row.id).run();
      continue;
    }
    try {
      let item = JSON.parse(row.payload_json);
      if (item.needsDetail) {
        if (details >= 8 || request.remaining() < 1) continue;
        details++;
        item = await reportDetail(item, request);
      }
      const signature = await reportSignature(row.ticker, item);
      await env.DB.batch([
        env.DB.prepare('INSERT OR IGNORE INTO report_alerts (signature, ticker, body, url, created_ms, sent_ms) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(signature, row.ticker, reportMessage(row.ticker, item), item.url, now, row.suppressed || paused ? now : null),
        env.DB.prepare('UPDATE report_items SET processed = 1 WHERE id = ?').bind(row.id),
      ]);
    } catch (error) {
      console.error('Report detail failed (' + row.source + '): ' + error.message);
      // Keep this item pending; other sources and other reports can still proceed.
    }
  }
}
export async function sendReportAlerts(env, now = Date.now()) {
  const state = await env.DB.prepare('SELECT paused FROM bot_runtime WHERE id = 1').first();
  if (state.paused) return 0;
  const companies = await liveWatchlist(env);
  const rows = await env.DB.prepare('SELECT * FROM report_alerts WHERE sent_ms IS NULL ORDER BY created_ms, signature LIMIT 6').all();
  let sent = 0;
  for (const row of rows.results || []) {
    if (companies.has(row.ticker)) {
      if (sent) await new Promise(resolve => setTimeout(resolve, 1100));
      await telegram(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text: row.body.slice(0, 4000), link_preview_options: { is_disabled: false, url: row.url } });
      sent++;
    }
    await env.DB.prepare('UPDATE report_alerts SET sent_ms = ? WHERE signature = ?').bind(now, row.signature).run();
  }
  return sent;
}

export async function runReportCheck(env, scheduledAt = Date.now(), options = {}) {
  const slot = reportSlot(scheduledAt);
  if (!slot) return { skipped: true };
  for (const name of ['DB', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']) if (!env[name]) throw Error('Report binding missing: ' + name);
  const now = Date.now(), owner = crypto.randomUUID();
  const lock = await env.DB.prepare('UPDATE report_runtime SET lock_owner = ?, lock_until_ms = ? WHERE id = 1 AND lock_until_ms < ? RETURNING id')
    .bind(owner, now + 300000, now).first();
  if (!lock) return { skipped: true };
  try {
    const companies = await liveWatchlist(env);
    const request = options.request || requestBudget(40, now + 200000);
    const collector = options.collector || collectSource;
    let succeeded = 0;
    // Spread collection over minutes: one source per invocation, keeping news independent.
    const offset = new Date(scheduledAt).getUTCMinutes() % REPORT_SOURCES.length;
    const sources = [...REPORT_SOURCES.slice(offset), ...REPORT_SOURCES.slice(0, offset)];
    let attempted = false;
    for (const source of sources) {
      const state = await env.DB.prepare('SELECT * FROM report_sources WHERE source = ?').bind(source).first();
      if (state?.checked_slot === slot) { succeeded++; continue; }
      if (state?.retry_after_ms > now) continue;
      if (attempted) continue;
      attempted = true;
      try {
        await recordSource(env, source, await collector(source, request, now), companies, slot, now);
        succeeded++;
      } catch (error) {
        console.error('Report source failed (' + source + '): ' + error.message);
        await env.DB.prepare('INSERT INTO report_sources (source, retry_after_ms, last_checked_ms, last_error) VALUES (?, ?, ?, ?) ON CONFLICT(source) DO UPDATE SET retry_after_ms = excluded.retry_after_ms, last_checked_ms = excluded.last_checked_ms, last_error = excluded.last_error')
          .bind(source, now + 120000, now, String(error.message).slice(0, 200)).run();
      }
    }
    const { paused } = await env.DB.prepare('SELECT paused FROM bot_runtime WHERE id = 1').first();
    await prepareAlerts(env, companies, request, now, paused);
    const sent = await sendReportAlerts(env, now);
    const pending = await env.DB.prepare('SELECT COUNT(*) AS n FROM report_alerts WHERE sent_ms IS NULL').first();
    const summary = '리포트 수집 ' + succeeded + '/' + REPORT_SOURCES.length + ' 경로 · 이번 발송 ' + sent + '건 · 대기 ' + pending.n + '건';
    await env.DB.prepare('UPDATE report_runtime SET last_checked_ms = ?, last_summary = ? WHERE id = 1').bind(now, summary).run();
    console.log(summary);
    return { sources: succeeded, sent, pending: pending.n };
  } finally {
    await env.DB.prepare('UPDATE report_runtime SET lock_owner = NULL, lock_until_ms = 0 WHERE id = 1 AND lock_owner = ?').bind(owner).run();
  }
}
