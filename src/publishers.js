const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE_WINDOW_MS = 7 * DAY_MS;
const MAX_BATCH_URLS = 90;
const PAGE_SIZE = 15;

// Display names are only an aid. Unknown or unmapped sources retain their
// original host instead of being misidentified as a publication.
const NAMES = {
  'yna.co.kr': '연합뉴스', 'newsis.com': '뉴시스',
  'news1.kr': '뉴스1', 'hankyung.com': '한국경제',
  'mk.co.kr': '매일경제', 'sedaily.com': '서울경제',
  'edaily.co.kr': '이데일리', 'mt.co.kr': '머니투데이',
  'fnnews.com': '파이낸셜뉴스', 'asiae.co.kr': '아시아경제',
  'biz.chosun.com': '조선비즈', 'chosun.com': '조선일보',
  'etnews.com': '전자신문', 'zdnet.co.kr': '지디넷코리아',
  'inews24.com': '아이뉴스24', 'gamechosun.co.kr': '게임조선',
  'gamemeca.com': '게임메카', 'viva100.com': '브릿지경제',
  'vegannews.co.kr': '비건뉴스', 'insight.co.kr': '인사이트',
  'pinpointnews.co.kr': '핀포인트뉴스', 'metroseoul.co.kr': '메트로신문',
  'emetro.co.kr': '메트로신문', '4th.kr': '포쓰저널',
  'newsquest.co.kr': '뉴스퀘스트', 'megaeconomy.co.kr': '메가경제',
  'hellot.net': '헬로티(헬로스톡)', 'ttlnews.com': 'TTL뉴스',
  'economytalk.kr': '이코노미톡뉴스',
};
export function publisherDomain(value) {
  try {
    const url = new URL(String(value || ''));
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.hostname.toLowerCase().replace(/\.$/, '').replace(/^(?:(?:www|m|mobile|amp)\.)+/g, '');
  } catch { return null; }
}
export function publisherName(domain) {
  const entry = Object.entries(NAMES).find(([name]) => domain === name || domain.endsWith('.' + name));
  return entry ? entry[1] : domain;
}

export function rawPublisherObservation(item, now, acceptedArticle, classifyExcluded, canonicalUrl) {
  const url = canonicalUrl(item.originallink || item.link);
  const domain = publisherDomain(url);
  const published = Date.parse(item.pubDate);
  // Avoid misleading history from old search results or malformed timestamps.
  if (!url || !domain || !Number.isFinite(published) ||
      published < now - DAY_MS || published > now + 300000) return null;
  return {url, domain, reason: acceptedArticle ? 'eligible' : classifyExcluded(item,url,published)};
}

// Read existing URLs before inserting to avoid charging D1 for repeated
// INSERT OR IGNORE statements on every 3-minute search cycle.
export async function recordPublisherObservations(env, observations, now) {
  const unique = new Map();
  for (const o of observations) {
    if (!o || !o.url || !o.domain) continue;
    const prior = unique.get(o.url);
    // On overlapping watchlist searches, prefer eligible over filtered.
    if (!prior || (prior.reason !== 'eligible' && o.reason === 'eligible')) unique.set(o.url, o);
  }
  let added = 0;
  const values = [...unique.values()];
  for (let i = 0; i < values.length; i += MAX_BATCH_URLS) {
    const batch = values.slice(i,i+MAX_BATCH_URLS);
    const placeholders = batch.map(() => '?').join(',');
    const prior = (await env.DB.prepare('SELECT url FROM news_publisher_seen WHERE url IN ('+placeholders+')')
      .bind(...batch.map(v=>v.url)).all()).results || [];
    const found = new Set(prior.map(row=>row.url));
    const fresh = batch.filter(row=>!found.has(row.url));
    if (fresh.length) {
      await env.DB.batch(fresh.map(v => env.DB.prepare(
        'INSERT OR IGNORE INTO news_publisher_seen(url,domain,first_seen_ms,reason) VALUES(?,?,?,?)'
      ).bind(v.url,v.domain,now,v.reason)));
      added += fresh.length;
    }
  }
  return added;
}

export async function publisherStatistics(env, now=Date.now(), page=1) {
  const offset = (page-1)*PAGE_SIZE;
  const cutoff = now - SOURCE_WINDOW_MS;
  const totals = await env.DB.prepare(
    'SELECT COUNT(*) AS articles, COUNT(DISTINCT domain) AS publishers FROM news_publisher_seen WHERE first_seen_ms>=?'
  ).bind(cutoff).first();
  const rows = (await env.DB.prepare(
    "SELECT s.domain, COUNT(*) AS collected, " +
    "SUM(CASE WHEN s.reason='blocked_source' THEN 1 ELSE 0 END) AS blocked, " +
    "SUM(CASE WHEN s.reason='content_filter' THEN 1 ELSE 0 END) AS filtered, " +
    "SUM(CASE WHEN s.reason='known_event' OR a.duplicate_of IS NOT NULL THEN 1 ELSE 0 END) AS duplicates, " +
    "SUM(CASE WHEN d.state='sent' THEN 1 ELSE 0 END) AS sent " +
    "FROM news_publisher_seen s LEFT JOIN news_delivery d ON d.url=s.url " +
    "LEFT JOIN articles a ON a.url=s.url " +
    "WHERE s.first_seen_ms>=? GROUP BY s.domain ORDER BY collected DESC,s.domain ASC LIMIT ? OFFSET ?"
  ).bind(cutoff,PAGE_SIZE,offset).all()).results || [];
  return { articles:totals?.articles || 0, publishers:totals?.publishers || 0, rows, page,
    pages:Math.max(1,Math.ceil((totals?.publishers || 0)/PAGE_SIZE)) };
}
export function formatPublisherStatistics(result) {
  const {rows,publishers,articles,page,pages} = result;
  let lines = ['네이버 뉴스 원문 언론사 통계 (최근 7일)','총 '+publishers+'개 출처 · '+articles+'개 고유 URL','조회 '+page+'/'+pages+'페이지'];
  if (!rows.length) lines.push('아직 집계된 언론사가 없습니다. 기능 배포 후 신규 검색 결과부터 기록합니다.');
  for (let i=0;i<rows.length;i++) {
    const r=rows[i], name=publisherName(r.domain);
    lines.push((page-1)*PAGE_SIZE+i+1+'. '+name+(name===r.domain?'':' ('+r.domain+')'));
    lines.push('   수집 '+r.collected+' · 발송 '+r.sent+' · 중복 '+r.duplicates+' · 내용제외 '+r.filtered+' · 매체차단 '+r.blocked);
  }
  lines.push('동일 URL 반복검색은 1건으로 계산하며, 실제 발송은 봇 전송기록 기준입니다.');
  lines.push('집계 시작 전의 과거 기사와 출처별 보도 건수 전체는 복원되지 않습니다.');
  if (pages>1) lines.push('다음 페이지: /publishers '+(page+1>pages?1:page+1));
  return lines.join('\n');
}
