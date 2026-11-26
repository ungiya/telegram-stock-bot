import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handleCommand, liveWatchlist } from '../src/commands.js';
import { runNewsCheck, normalizeArticle, canonicalUrl, cleanTitle, formatNewsMessage, shortSummary, blockedNewsSource, naverError } from '../src/worker.js';
import { newsRejectReason } from '../src/filters.js';
import { sameNews } from '../src/news-dedup.js';

function fixture(t, destination = '111') {
  const sql = new DatabaseSync(':memory:');
  for (const name of ['0001_init.sql', '0002_commands.sql', '0003_reports.sql', '0004_news_descriptions.sql', '0005_news_dedup.sql', '0006_dart.sql', '0007_news_schedule.sql', '0008_kind.sql', '0009_news_delivery.sql', '0010_news_filter_count.sql', '0011_news_publishers.sql']) sql.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  const DB = {
    prepare(query) {
      const statement = (values = []) => ({
        bind: (...args) => statement(args),
        first: async () => sql.prepare(query).get(...values) || null,
        all: async () => ({ results: sql.prepare(query).all(...values) }),
        run: async () => sql.prepare(query).run(...values),
      });
      return statement();
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const result = []; for (const s of statements) result.push(await s.run()); sql.exec('COMMIT'); return result; }
      catch (e) { sql.exec('ROLLBACK'); throw e; }
    },
  };
  const calls = [], replies = [], searches = [];
  let updates = [], news = [], member = 'member', failSendAt = 0, sendAttempts = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'naverapihub.apigw.ntruss.com') {
      searches.push(parsed.searchParams.get('query'));
      return Response.json({ items: news });
    }
    const method = parsed.pathname.split('/').at(-1);
    const params = JSON.parse(options.body); calls.push({ method, params });
    let result = true;
    if (method === 'getWebhookInfo') result = { url: '' };
    if (method === 'getUpdates') result = updates.filter(u => params.offset < 0 || u.update_id >= params.offset).slice(params.offset < 0 ? -1 : 0, params.offset < 0 ? undefined : params.limit);
    if (method === 'getChatMember') result = { status: member };
    if (method === 'sendMessage') {
      sendAttempts++;
      if (sendAttempts === failSendAt) return Response.json({ ok: false, description: 'temporary failure' }, { status: 500 });
      replies.push(params);
    }
    return Response.json({ ok: true, result });
  };
  t.after(() => { globalThis.fetch = originalFetch; sql.close(); });
  const env = { DB, TELEGRAM_CHAT_ID: destination, TELEGRAM_BOT_TOKEN: 'test-only', NAVER_CLIENT_ID: 'test', NAVER_CLIENT_SECRET: 'test' };
  return { env, sql, calls, replies, searches, failSend: attempt => { failSendAt = attempt; }, setUpdates: value => { updates = value; }, setNews: value => { news = value; }, setMember: value => { member = value; } };
}
const message = (text, id = 111) => ({ text, from: { id, is_bot: false }, chat: { id, type: 'private' } });
const command = async (f, name, arg = '') => handleCommand(f.env, message('/' + name + ' ' + arg), { name, arg });
async function onlyCompany(f, name = '테스트기업') {
  for (const ticker of (await liveWatchlist(f.env)).keys()) await command(f, 'remove', ticker);
  await command(f, 'add', name);
  f.replies.length = 0;
  await runNewsCheck(f.env); // 첫 검색: 기준선만 기록
}
const naver = (title, url, minutesAgo = 1, description = '') =>
  ({ title, description, originallink: url, pubDate: new Date(Date.now() - minutesAgo * 60000).toUTCString() });

test('텍스트 정리와 URL 정규화', () => {
  assert.equal(cleanTitle('<b>테스트</b> &amp; &quot;뉴스&quot;'), '테스트 & "뉴스"');
  assert.equal(canonicalUrl('https://a.com/x?utm_source=n&id=1#top'), 'https://a.com/x?id=1');
  assert.equal(canonicalUrl('javascript:alert(1)'), null);
  assert.ok(blockedNewsSource('https://m.insight.co.kr/news/1'));
  assert.ok(!blockedNewsSource('https://www.yna.co.kr/view/1'));
});

test('주가에 영향을 줄 만한 기사만 통과한다', () => {
  const cases = [
    ['크래프톤', '크래프톤, 3분기 영업이익 3,486억원…역대 최대', null],
    ['크래프톤', '[특징주] 크래프톤, 실적 호조에 7% 급등', 'price'],
    ['크래프톤', '크래프톤, 목표주가 45만원으로 상향', 'analyst'],
    ['크래프톤', '크래프톤, PUBG 글로벌 e스포츠 대회 개막', 'promo'],
    ['크래프톤', '[포토] 크래프톤 지스타 부스', 'non_news'],
    ['크래프톤', '크래프톤, 연말 맞아 임직원 봉사활동', 'promo'],
    ['크래프톤', '넥슨, 신작 출시', 'not_in_title'],
    ['알테오젠', '알테오젠, 3000억 규모 기술이전 계약 체결', null],
    ['에이피알', '에이피알, 메디큐브 팝업스토어 성수 오픈', 'promo'],
    ['에이피알', '에이피알, 할인 행사에도 3분기 영업이익 급증', null],
    ['에이피알', '에이피알 대표 "뷰티 디바이스로 글로벌 1위"', 'not_material'],
    ['무신사', '무신사, 김지용 크리에이티브 디렉터 영입', 'company_promo'],
    ['무신사', '무신사, 내년 상반기 IPO 추진', null],
    ['와디즈', '와디즈 겨울 펀딩 프로젝트 매출 30억 돌파', 'company_promo'],
    ['효성중공업', '[산업 브리핑] 효성중공업·LS일렉트릭·HD현대 수주', 'roundup'],
    ['한화솔루션', '한화솔루션, 유상증자 1조 결정', null],
  ];
  for (const [ticker, title, reason] of cases) assert.equal(newsRejectReason(ticker, [ticker], title), reason, title);
});

test('같은 사건의 다른 언론사 기사는 묶고, 다른 소식은 따로 둔다', () => {
  const now = Date.now();
  const n = (title, hours = 0, description = '') => ({ ticker: '알테오젠', url: title + '#' + hours, title, description, pub_ms: now + hours * 3600000 });
  assert.ok(sameNews(n('알테오젠, 3분기 영업이익 500억…역대 최대'), n('알테오젠 3Q 영업익 500억원, 사상 최대', 2)));
  assert.ok(sameNews(n('알테오젠, 3분기 영업이익 500억'), n('알테오젠 3분기 매출 1200억 달성', 3)));
  assert.ok(sameNews(n('알테오젠, 3000억 규모 기술이전 계약 체결'), n('알테오젠 3000억 L/O…빅파마와 계약', 3)));
  assert.ok(!sameNews(n('알테오젠, 3000억 기술이전 계약 체결'), n('알테오젠, 기술이전 계약 해지', 5)));
  assert.ok(!sameNews(n('알테오젠, 3분기 영업이익 500억'), n('알테오젠, 4분기 흑자 전망', 3)));
  assert.ok(!sameNews(n('알테오젠, 3분기 영업이익 500억'), n('알테오젠, 유상증자 결정', 1)));
  // 36시간이 지나면 비슷한 제목이라도 새 소식
  assert.ok(!sameNews(n('알테오젠, 키트루다 SC 허가'), n('알테오젠, 키트루다 SC 허가', 40)));
});

test('메시지는 회사별로 묶고 제목 링크·언론사·시각·한 줄 요약만 담는다', () => {
  const pub = Date.parse('2026-11-27T05:03:00Z');
  const text = formatNewsMessage('크래프톤', [
    { url: 'https://www.yna.co.kr/view/1', title: '크래프톤 <실적> 발표', description: '크래프톤이 3분기 영업이익 3486억원을 기록했다. 전년 대비 21% 늘었다.', pub_ms: pub },
  ]);
  assert.equal(text, '📰 <b>크래프톤</b>\n\n• <a href="https://www.yna.co.kr/view/1">크래프톤 &lt;실적&gt; 발표</a>\n  <i>연합뉴스 · 14:03</i>\n  크래프톤이 3분기 영업이익 3486억원을 기록했다.');
  assert.equal(shortSummary('(서울=뉴스1) 김기자 = ' + '가'.repeat(200)).length, 110);
});

test('3시간 지난 기사는 받지 않고, 대기열의 6시간 지난 기사는 버린다', async t => {
  const f = fixture(t);
  await onlyCompany(f);
  f.setNews([naver('테스트기업 공급계약 체결', 'https://example.com/old', 200), naver('테스트기업 수주 공시', 'https://example.com/new', 5)]);
  f.sql.prepare('INSERT INTO articles (url,ticker,title,description,pub_ms,discovered_ms) VALUES (?,?,?,?,?,?)')
    .run('https://example.com/stale', '테스트기업', '테스트기업 증설 결정', '', Date.now() - 7 * 3600000, Date.now());
  assert.equal((await runNewsCheck(f.env)).sent, 1);
  assert.equal(f.replies.length, 1);
  assert.match(f.replies[0].text, /수주 공시/);
  assert.doesNotMatch(f.replies[0].text, /공급계약 체결|증설 결정/);
  assert.equal(f.replies[0].parse_mode, 'HTML');
  assert.equal(f.replies[0].link_preview_options.is_disabled, true);
  assert.equal(f.sql.prepare('SELECT duplicate_of FROM articles WHERE url=?').get('https://example.com/stale').duplicate_of, 'stale');
  assert.equal(f.sql.prepare('SELECT count(*) n FROM articles WHERE url=?').get('https://example.com/old').n, 0);
});

test('같은 소식은 한 번만, 다른 소식은 한 메시지로 묶어 보낸다', async t => {
  const f = fixture(t);
  await onlyCompany(f);
  const lead = '테스트기업이 미국 전력회사와 2000억원 규모 변압기 공급계약을 체결했다고 27일 공시했다. 계약 기간은 3년이다.';
  f.setNews([
    naver('테스트기업, 美 전력회사와 2000억 변압기 공급계약', 'https://a.example/1', 10, lead),
    naver('테스트기업 2000억원 규모 공급계약 체결', 'https://b.example/1', 8, lead),
    naver('테스트기업, 3분기 영업이익 흑자전환', 'https://c.example/1', 6),
    naver('[특징주] 테스트기업 15% 급등', 'https://d.example/1', 5),
  ]);
  assert.equal((await runNewsCheck(f.env)).sent, 2);
  assert.equal(f.replies.length, 1);
  assert.match(f.replies[0].text, /a\.example/);
  assert.doesNotMatch(f.replies[0].text, /b\.example|특징주/);
  assert.match(f.replies[0].text, /흑자전환/);
  // 다음 실행에서 다른 언론사가 같은 소식을 써도 다시 보내지 않는다
  f.setNews([naver('[단독] 테스트기업, 2000억 변압기 수주', 'https://e.example/1', 2, lead)]);
  assert.equal((await runNewsCheck(f.env)).sent, 0);
  assert.equal(f.replies.length, 1);
  assert.equal(f.sql.prepare('SELECT duplicate_of FROM articles WHERE url=?').get('https://e.example/1').duplicate_of, 'https://a.example/1');
});

test('전송 실패는 다음 실행에서 다시 보내고 이미 보낸 기사는 반복하지 않는다', async t => {
  const f = fixture(t);
  await onlyCompany(f);
  f.setNews([naver('테스트기업 유상증자 결정', 'https://a.example/x', 3)]);
  f.failSend(f.calls.filter(c => c.method === 'sendMessage').length + 1);
  await assert.rejects(runNewsCheck(f.env), /temporary failure/);
  assert.equal(f.sql.prepare("SELECT count(*) n FROM news_delivery").get().n, 0);
  assert.equal((await runNewsCheck(f.env)).sent, 1);
  assert.equal((await runNewsCheck(f.env)).sent, 0);
  assert.equal(f.replies.length, 1);
});

test('네이버 오류 메시지는 응답 원문을 노출하지 않는다', async () => {
  const error = await naverError(Response.json({ errorCode: '429', secret: 'x' }, { status: 429 }));
  assert.match(error.message, /429 · code 429 \(daily quota exceeded\)/);
  assert.doesNotMatch(error.message, /secret/);
});

test('normalizeArticle은 미래 날짜·차단 매체·비중요 기사를 거른다', () => {
  const now = Date.now();
  const ok = { title: '크래프톤 자사주 소각', originallink: 'https://a.com/1', pubDate: new Date(now).toUTCString() };
  assert.ok(normalizeArticle(ok, '크래프톤', now));
  assert.equal(normalizeArticle({ ...ok, pubDate: new Date(now + 3600000).toUTCString() }, '크래프톤', now), null);
  assert.equal(normalizeArticle({ ...ok, originallink: 'https://www.topstarnews.net/1' }, '크래프톤', now), null);
  assert.equal(normalizeArticle({ ...ok, title: '크래프톤 사옥 탐방기' }, '크래프톤', now), null);
});
