import { NEWS_POLICY_VERSION } from './news-policy-version.js';
import { withNewsDeliveryLock, recentDelivered, findDuplicate, deliverNewsGroup } from './news-delivery.js';
import { sameNews } from './news-dedup.js';
import { KIND_CRON, runKindCheck } from './kind.js';
import { claimNewsSearch } from './news-schedule.js';
import { DART_CRON, runDartCheck } from './dart.js';
import { REPORT_CRON, runReportCheck } from './reports.js';
import { liveWatchlist, pollCommands, withBotLock } from './commands.js';
import { newsRejectReason, blockedNewsSource } from './filters.js';
import { ALIASES } from './watchlist.js';

export { blockedNewsSource };

const NAVER_NEWS_API = 'https://naverapihub.apigw.ntruss.com/search/v1/news';
const TELEGRAM_API = 'https://api.telegram.org';
// 지난 뉴스가 오지 않도록: 발행 3시간이 지난 기사는 새로 받지 않고,
// 대기열에서 6시간이 지난 기사는 보내지 않고 버린다.
export const INGEST_MAX_AGE_MS = 3 * 3600000;
export const SEND_MAX_AGE_MS = 6 * 3600000;
const MAX_CLAIM = 40;
const MAX_ITEMS_PER_MESSAGE = 8;

export function cleanTitle(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_all, entity) => {
      const normalized = entity.toLowerCase();
      const known = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
      if (Object.hasOwn(known, normalized)) return known[normalized];
      const n = normalized.startsWith('#x') ? Number.parseInt(normalized.slice(2), 16) : Number.parseInt(normalized.slice(1), 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/\s+/g, ' ')
    .trim();
}

export function canonicalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || ['fbclid', 'gclid'].includes(key.toLowerCase())) url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

// 네이버 검색 결과 1건 → 저장할 기사. 제외 대상이면 null.
export function normalizeArticle(item, ticker, now, aliases = ALIASES[ticker] || [ticker]) {
  if (blockedNewsSource(item.originallink) || blockedNewsSource(item.link)) return null;
  const url = canonicalUrl(item.originallink || item.link);
  const title = cleanTitle(item.title);
  const publishedAt = Date.parse(item.pubDate);
  if (!url || !title || !Number.isFinite(publishedAt) || publishedAt > now + 300_000) return null;
  const description = cleanTitle(item.description);
  if (newsRejectReason(ticker, aliases, title, description)) return null;
  return { url, ticker, title, description, publishedAt };
}

export function escapeTelegramHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const PUBLISHERS = {
  'yna.co.kr': '연합뉴스', 'newsis.com': '뉴시스', 'news1.kr': '뉴스1', 'hankyung.com': '한국경제',
  'mk.co.kr': '매일경제', 'sedaily.com': '서울경제', 'edaily.co.kr': '이데일리', 'mt.co.kr': '머니투데이',
  'fnnews.com': '파이낸셜뉴스', 'asiae.co.kr': '아시아경제', 'biz.chosun.com': '조선비즈', 'chosun.com': '조선일보',
  'etnews.com': '전자신문', 'zdnet.co.kr': '지디넷', 'inews24.com': '아이뉴스24', 'heraldcorp.com': '헤럴드경제',
  'hankookilbo.com': '한국일보', 'joongang.co.kr': '중앙일보', 'donga.com': '동아일보', 'thebell.co.kr': '더벨',
  'yakup.com': '약업신문', 'hitnews.co.kr': '히트뉴스', 'biospectator.com': '바이오스펙테이터', 'dailypharm.com': '데일리팜',
  'ddaily.co.kr': '디지털데일리', 'bloter.net': '블로터', 'newspim.com': '뉴스핌', 'ajunews.com': '아주경제',
  'seoul.co.kr': '서울신문', 'khan.co.kr': '경향신문', 'hani.co.kr': '한겨레', 'businesspost.co.kr': '비즈니스포스트',
};
export function publisherName(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^(?:www|m|mobile|amp)\./, '');
    const hit = Object.entries(PUBLISHERS).find(([domain]) => host === domain || host.endsWith('.' + domain));
    return hit ? hit[1] : host;
  } catch { return ''; }
}
function kstTime(ms) {
  const d = new Date(Number(ms) + 9 * 3600000);
  return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0');
}
// 요약: 네이버가 주는 기사 첫 부분에서 첫 문장(최대 110자)
export function shortSummary(description) {
  const text = cleanTitle(description).replace(/^\[[^\]]{0,30}\]\s*/, '').replace(/^\S{2,6}\s*=\s*/, '');
  if (!text) return '';
  const sentence = text.match(/^.{20,}?(?:다\.|요\.|[.!?])(?=\s|$)/)?.[0] || text;
  return sentence.length > 110 ? sentence.slice(0, 109) + '…' : sentence;
}

// 같은 종목의 새 기사들을 한 메시지로: 제목(링크) · 언론사 · 시각 · 한 줄 요약
export function formatNewsMessage(ticker, items) {
  const lines = ['📰 <b>' + escapeTelegramHtml(ticker) + '</b>'];
  for (const item of items) {
    const meta = [publisherName(item.url), kstTime(item.pub_ms ?? item.publishedAt)].filter(Boolean).join(' · ');
    lines.push('');
    lines.push('• <a href="' + escapeTelegramHtml(item.url) + '">' + escapeTelegramHtml(item.title.slice(0, 200)) + '</a>');
    lines.push('  <i>' + escapeTelegramHtml(meta) + '</i>');
    const summary = shortSummary(item.description);
    if (summary) lines.push('  ' + escapeTelegramHtml(summary));
  }
  return lines.join('\n').slice(0, 4000);
}

export async function naverError(response) {
  let data;
  try { data = await response.json(); } catch { data = {}; }
  const raw = data?.error?.errorCode ?? data?.errorCode;
  const code = raw != null && /^[A-Za-z0-9_-]{1,12}$/.test(String(raw)) ? String(raw) : 'unknown';
  const meanings = { '400': 'quota exceeded', '410': 'throttle limited', '420': 'rate limited', '429': 'daily quota exceeded' };
  return new Error('Naver news API status ' + response.status + ' · code ' + code
    + (response.status === 429 && meanings[code] ? ' (' + meanings[code] + ')' : ''));
}

async function searchNews(env, aliases) {
  const items = [];
  for (const query of aliases) {
    const url = new URL(NAVER_NEWS_API);
    url.searchParams.set('query', query);
    url.searchParams.set('display', '100');
    url.searchParams.set('format', 'json');
    url.searchParams.set('sort', 'date');
    const response = await fetch(url, {
      headers: { 'X-NCP-APIGW-API-KEY-ID': env.NAVER_CLIENT_ID, 'X-NCP-APIGW-API-KEY': env.NAVER_CLIENT_SECRET },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw await naverError(response);
    const payload = await response.json();
    if (!Array.isArray(payload.items)) throw new Error('Invalid Naver news response');
    items.push(...payload.items);
  }
  return items;
}

async function pollTopic(env, ticker, aliases, now, paused) {
  const items = await searchNews(env, aliases);
  const baseline = await env.DB.prepare('SELECT initialized_at FROM topic_state WHERE ticker = ?').bind(ticker).first();
  const normalized = items.map(item => normalizeArticle(item, ticker, now, aliases));
  const articles = normalized.filter(item => item && item.publishedAt >= now - INGEST_MAX_AGE_MS);
  // 처음 추가한 종목은 현재 기사를 "본 것"으로만 기록 (옛 기사 폭탄 방지)
  const markSent = !baseline || paused;
  const writes = articles.map(item => env.DB.prepare(
    'INSERT OR IGNORE INTO articles (url, ticker, title, description, pub_ms, discovered_ms, sent_ms, lease_until_ms) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)'
  ).bind(item.url, item.ticker, item.title, item.description, item.publishedAt, now, markSent ? now : null));
  if (!baseline) writes.push(env.DB.prepare('INSERT OR IGNORE INTO topic_state (ticker, initialized_at) VALUES (?, ?)').bind(ticker, now));
  if (writes.length) await env.DB.batch(writes);
  return normalized.filter(item => !item).length;
}

// 대기 중 기사도 최신 필터 기준으로 다시 확인한다.
export function queuedNewsExcluded(item, aliases = ALIASES[item.ticker] || [item.ticker]) {
  return blockedNewsSource(item.url) || Boolean(newsRejectReason(item.ticker, aliases, item.title, item.description));
}

async function sendTelegram(env, text) {
  const response = await fetch(TELEGRAM_API + '/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }),
    signal: AbortSignal.timeout(8000),
  });
  let data = {};
  try { data = await response.json(); } catch { /* 응답 해석 실패는 결과 불확실로 처리 */ }
  if (!response.ok || !data.ok) {
    const failure = new Error('Telegram API status ' + response.status + ': ' + (data.description || 'unknown'));
    failure.definitelyNotSent = data.ok === false;
    throw failure;
  }
}

async function sendPending(env, now, companies) {
  return withNewsDeliveryLock(env, renew => sendClaimedNews(env, now, companies, renew));
}

async function sendClaimedNews(env, now, companies, renew) {
  if (!companies.size) return { sent: 0, duplicates: 0 };
  const active = [...companies.keys()];
  const rows = (await env.DB.prepare(
    'UPDATE articles SET lease_until_ms = ? WHERE url IN ' +
    '(SELECT url FROM articles WHERE sent_ms IS NULL AND (lease_until_ms IS NULL OR lease_until_ms < ?) ' +
    'AND ticker IN (' + active.map(() => '?').join(',') + ') ORDER BY pub_ms ASC LIMIT ?) ' +
    'RETURNING url, ticker, title, description, pub_ms'
  ).bind(now + 120_000, now, ...active, MAX_CLAIM).all()).results || [];
  rows.sort((a, b) => a.pub_ms - b.pub_ms || a.url.localeCompare(b.url));

  const close = (item, reason) => env.DB.prepare('UPDATE articles SET sent_ms = ?, duplicate_of = ?, lease_until_ms = NULL WHERE url = ?')
    .bind(now, reason, item.url);
  const closing = [], chosen = new Map(), history = new Map();
  let duplicates = 0;
  for (const item of rows) {
    const aliases = companies.get(item.ticker) || [item.ticker];
    if (item.pub_ms < now - SEND_MAX_AGE_MS) { closing.push(close(item, 'stale')); continue; }
    if (queuedNewsExcluded(item, aliases)) { closing.push(close(item, 'filtered')); continue; }
    if (!history.has(item.ticker)) history.set(item.ticker, await recentDelivered(env, item.ticker, now));
    const group = chosen.get(item.ticker) || [];
    const duplicate = findDuplicate(item, history.get(item.ticker), aliases) || group.find(prev => sameNews(item, prev, aliases));
    if (duplicate) {
      duplicates++;
      closing.push(close(item, duplicate.url));
      continue;
    }
    group.push(item);
    chosen.set(item.ticker, group);
  }
  if (closing.length) await env.DB.batch(closing);

  let sent = 0;
  try {
    for (const [ticker, items] of chosen) {
      for (let i = 0; i < items.length; i += MAX_ITEMS_PER_MESSAGE) {
        await renew();
        if (sent) await new Promise(resolve => setTimeout(resolve, 1100));
        const part = items.slice(i, i + MAX_ITEMS_PER_MESSAGE);
        const delivered = await deliverNewsGroup(env, part, list => sendTelegram(env, formatNewsMessage(ticker, list)), Date.now());
        await env.DB.batch(part.map(item => env.DB.prepare('UPDATE articles SET sent_ms = ?, lease_until_ms = NULL WHERE url = ?').bind(now, item.url)));
        sent += delivered.length;
      }
    }
  } catch (error) {
    // 아직 보내지 못한 기사는 다음 실행에서 다시 시도
    await env.DB.prepare('UPDATE articles SET lease_until_ms = NULL WHERE sent_ms IS NULL AND lease_until_ms IS NOT NULL').run();
    throw error;
  }
  return { sent, duplicates };
}

export async function runNewsCheck(env, scheduledAt = Date.now(), deadline = Date.now() + 230000) {
  for (const field of ['DB', 'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID']) {
    if (!env[field]) throw new Error('Required Worker binding or secret is missing: ' + field);
  }
  const now = Date.now();
  const companies = await liveWatchlist(env);
  const state = await env.DB.prepare('SELECT paused, last_checked_ms FROM bot_runtime WHERE id = 1').first();
  let succeeded = 0, filtered = 0;
  for (const [ticker, aliases] of companies) {
    if (Date.now() >= deadline) break;
    try {
      filtered += await pollTopic(env, ticker, aliases, now, state.paused);
      succeeded++;
    } catch (error) {
      console.error('Search failed for ' + ticker + ': ' + error.message);
    }
  }
  if (companies.size && succeeded === 0) throw new Error('All news searches failed; no alert was sent.');
  const result = state.paused ? { sent: 0, duplicates: 0 } : (await sendPending(env, now, companies)) || { sent: 0, duplicates: 0 };
  await env.DB.prepare('UPDATE bot_runtime SET last_checked_ms = ?, last_checked_count = ?, last_sent_count = ?, last_filtered_count = ?, last_duplicate_count = ? WHERE id = 1')
    .bind(now, succeeded, result.sent, filtered, result.duplicates).run();
  // 6시간마다 오래된 기록 정리 (기사 7일, 발송 기록 14일)
  if (Math.floor((state.last_checked_ms || 0) / 21600000) !== Math.floor(now / 21600000)) {
    await env.DB.prepare("DELETE FROM news_delivery WHERE attempt_ms < ? AND state = 'sent'").bind(now - 14 * 86400000).run();
    await env.DB.prepare('DELETE FROM articles WHERE pub_ms < ?').bind(now - 7 * 86400000).run();
    try { await env.DB.prepare('DELETE FROM news_publisher_seen').run(); } catch { /* 예전 통계 테이블 없음 */ }
  }
  console.log(NEWS_POLICY_VERSION + ' filtered=' + filtered + ' duplicates=' + result.duplicates + '. Checked ' + succeeded + '/' + companies.size + ' tickers. Sent ' + result.sent + ' articles.');
  return { checked: succeeded, sent: result.sent };
}

export default {
  async scheduled(controller, env) {
    if (controller.cron === KIND_CRON) { await runKindCheck(env, controller.scheduledTime); return; }
    if (controller.cron === DART_CRON) { await runDartCheck(env); return; }
    if (controller.cron === REPORT_CRON) { await runReportCheck(env, controller.scheduledTime); return; }
    await withBotLock(env, async () => {
      const deadline = Date.now() + 230000;
      try { await pollCommands(env); }
      catch (error) { console.error('Cloud commands: ' + error.message); }
      const companies = await liveWatchlist(env);
      if (await claimNewsSearch(env, companies)) await runNewsCheck(env, controller.scheduledTime, deadline);
    });
  },
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, purpose: 'stock-news-alert', interval: 'adaptive news; commands and disclosures every minute', news_filter_version: NEWS_POLICY_VERSION });
    }
    return new Response('Not found', { status: 404 });
  },
};
