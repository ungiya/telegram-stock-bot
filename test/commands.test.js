import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { authorized, handleCommand, liveWatchlist, pollCommands, withBotLock } from '../src/commands.js';
import { runNewsCheck } from '../src/worker.js';

function fixture(t, destination = '111') {
  const sql = new DatabaseSync(':memory:');
  for (const name of ['0001_init.sql', '0002_commands.sql', '0003_reports.sql', '0004_news_descriptions.sql', '0005_news_dedup.sql', '0006_dart.sql', '0007_news_schedule.sql', '0008_kind.sql', '0009_news_delivery.sql', '0010_news_filter_count.sql']) sql.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
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
const command = async (f, name, arg = '', sender = 111) => handleCommand(f.env, message('/' + name + ' ' + arg, sender), { name, arg });

test('list includes 달바글로벌; add/remove update the search list and persist tombstones', async t => {
  const f = fixture(t);
  await command(f, 'list');
  assert.match(f.replies.at(-1).text, /26개/);
  assert.match(f.replies.at(-1).text, /달바글로벌/);
  await command(f, 'add', '테스트기업');
  assert.deepEqual((await liveWatchlist(f.env)).get('테스트기업'), ['테스트기업']);
  await command(f, 'remove', '달바글로벌');
  assert.equal((await liveWatchlist(f.env)).has('달바글로벌'), false);
  // Reloading defaults on the next tick must not undo an explicit removal.
  assert.equal((await liveWatchlist(f.env)).has('달바글로벌'), false);
  await command(f, 'add', '달바글로벌');
  assert.equal((await liveWatchlist(f.env)).has('달바글로벌'), true);
  await command(f, 'add', 'LS ELECTRIC');
  assert.equal((await liveWatchlist(f.env)).has('LS ELECTRIC'), false);
});

test('unauthorized private users and forwarded channel identities cannot change state', async t => {
  const f = fixture(t);
  await command(f, 'remove', '달바글로벌', 222);
  assert.equal((await liveWatchlist(f.env)).has('달바글로벌'), true);
  assert.equal(f.replies.length, 0);
  assert.equal(await authorized(f.env, { ...message('/list'), sender_chat: { id: -1 } }), false);
});

test('channel management requires a verified administrator in a private bot chat', async t => {
  const f = fixture(t, '-100123');
  await command(f, 'add', '테스트기업');
  assert.equal((await liveWatchlist(f.env)).has('테스트기업'), false);
  f.setMember('administrator');
  await command(f, 'add', '테스트기업');
  assert.equal((await liveWatchlist(f.env)).has('테스트기업'), true);
  assert.equal(await authorized(f.env, { ...message('/list'), chat: { id: -100123, type: 'supergroup' } }), false);
});

test('bootstrap ignores historical commands, then processes fresh updates only once', async t => {
  const f = fixture(t);
  f.setUpdates([{ update_id: 10, message: message('/remove 달바글로벌') }]);
  await pollCommands(f.env);
  assert.equal((await liveWatchlist(f.env)).has('달바글로벌'), true);
  f.setUpdates([{ update_id: 11, message: message('/list') }, { update_id: 12, message: message('/add 테스트기업') }]);
  await pollCommands(f.env);
  assert.equal((await liveWatchlist(f.env)).has('테스트기업'), true);
  assert.match(f.replies[0].text, /달바글로벌/);
  const count = f.replies.length;
  await pollCommands(f.env);
  assert.equal(f.replies.length, count);
});

test('overlapping cron runs cannot simultaneously execute bot tasks; failure releases lock', async t => {
  const f = fixture(t);
  let ran = false;
  await withBotLock(f.env, async () => { await withBotLock(f.env, async () => { ran = true; }); });
  assert.equal(ran, false);
  await assert.rejects(withBotLock(f.env, async () => { throw Error('test failure'); }));
  await withBotLock(f.env, async () => { ran = true; });
  assert.equal(ran, true);
});

test('news polling uses command-managed list; new ticker baselines then sends new results', async t => {
  const f = fixture(t);
  for (const name of (await liveWatchlist(f.env)).keys()) await command(f, 'remove', name);
  await command(f, 'add', '테스트기업');
  f.replies.length = 0;
  await runNewsCheck(f.env);
  assert.deepEqual(f.searches, ['테스트기업']);
  assert.equal(f.replies.length, 0);
  f.setNews([{ title: '테스트기업 공급 계약', originallink: 'https://example.com/business', pubDate: new Date().toUTCString() }]);
  await runNewsCheck(f.env);
  assert.match(f.replies[0].text, /테스트기업/);
  const sent = f.replies.length;
  await runNewsCheck(f.env);
  assert.equal(f.replies.length, sent);
});

test('remove suppresses queued news; pause keeps commands active and resume works with empty list', async t => {
  const f = fixture(t);
  f.sql.prepare('INSERT INTO articles (url,ticker,title,pub_ms,discovered_ms) VALUES (?,?,?,?,?)')
    .run('https://example.com/pending', '달바글로벌', '달바글로벌 실적', Date.now(), Date.now());
  await command(f, 'remove', '달바글로벌');
  assert.ok(f.sql.prepare('SELECT sent_ms FROM articles').get().sent_ms);
  await command(f, 'pause');
  await command(f, 'list');
  assert.match(f.replies.at(-1).text, /25개/);
  assert.equal(f.sql.prepare('SELECT paused FROM bot_runtime').get().paused, 1);
  await command(f, 'resume');
  assert.equal(f.sql.prepare('SELECT paused FROM bot_runtime').get().paused, 0);
  for (const name of (await liveWatchlist(f.env)).keys()) await command(f, 'remove', name);
  assert.deepEqual(await runNewsCheck(f.env), { checked: 0, sent: 0 });
});

test('already queued blocked outlets are suppressed while other pending news still sends', async t => {
  const f = fixture(t);
  const insert = f.sql.prepare('INSERT INTO articles (url,ticker,title,pub_ms,discovered_ms) VALUES (?,?,?,?,?)');
  insert.run('https://www.vegannews.co.kr/news/article.html?no=1', '달바글로벌', '차단할 기사', Date.now(), Date.now());
  insert.run('https://www.insight.co.kr/news/1', '달바글로벌', '인사이트 차단 기사', Date.now(), Date.now());
  insert.run('https://www.pinpointnews.co.kr/news/articleView.html?idxno=1', '달바글로벌', '핀포인트 차단 기사', Date.now(), Date.now());
  insert.run('https://www.metroseoul.co.kr/article/1', '달바글로벌', '메트로 차단 기사', Date.now(), Date.now());
  insert.run('https://m.emetro.co.kr/article/2', '달바글로벌', '메트로 구주소 차단 기사', Date.now(), Date.now());
  insert.run('https://www.4th.kr/news/articleView.html?idxno=1', '달바글로벌', '포쓰저널 차단 기사', Date.now(), Date.now());
  insert.run('https://example.com/allowed', '달바글로벌', '허용할 기사', Date.now(), Date.now());
  const result = await runNewsCheck(f.env);
  assert.equal(result.sent, 1);
  assert.equal(f.replies.length, 1);
  assert.match(f.replies[0].text, /허용할 기사/);
  assert.doesNotMatch(f.replies[0].text, /vegannews|insight\.co\.kr|차단할 기사|인사이트 차단 기사/);
  assert.ok(f.sql.prepare('SELECT sent_ms FROM articles WHERE url LIKE ?').get('%vegannews%').sent_ms);
  assert.ok(f.sql.prepare('SELECT sent_ms FROM articles WHERE url LIKE ?').get('%insight.co.kr%').sent_ms);
  assert.ok(f.sql.prepare('SELECT sent_ms FROM articles WHERE url LIKE ?').get('%pinpointnews.co.kr%').sent_ms);
  assert.ok(f.sql.prepare('SELECT sent_ms FROM articles WHERE url LIKE ?').get('%metroseoul.co.kr%').sent_ms);
  assert.ok(f.sql.prepare('SELECT sent_ms FROM articles WHERE url LIKE ?').get('%emetro.co.kr%').sent_ms);
  assert.ok(f.sql.prepare('SELECT sent_ms FROM articles WHERE url LIKE ?').get('%4th.kr%').sent_ms);
});

test('news summaries survive collection and each article gets its own visible URL preview', async t => {
  const f = fixture(t);
  for (const name of (await liveWatchlist(f.env)).keys()) await command(f, 'remove', name);
  await command(f, 'add', '테스트기업');
  f.replies.length = 0;
  await runNewsCheck(f.env);
  f.setNews([1, 2].map(n => ({ title: '테스트기업 공급 계약 ' + n, description: '<b>테스트기업</b> 계약 내용 &amp; 요약 ' + n,
    originallink: 'https://example.com/news/' + n, pubDate: new Date().toUTCString() })));
  assert.equal((await runNewsCheck(f.env)).sent, 2);
  assert.equal(f.replies.length, 2);
  for (const reply of f.replies) {
    assert.match(reply.text, /^\[테스트기업\] 테스트기업 공급 계약 [12]\n테스트기업 계약 내용 & 요약 [12]\nhttps:\/\/example.com\/news\/[12]$/);
    assert.equal(reply.parse_mode, undefined);
    assert.equal(reply.link_preview_options.is_disabled, false);
    assert.ok(reply.text.endsWith(reply.link_preview_options.url));
  }
});

test('partial delivery retries remaining articles without resending the first successful article', async t => {
  const f = fixture(t);
  const insert = f.sql.prepare('INSERT INTO articles (url,ticker,title,description,pub_ms,discovered_ms) VALUES (?,?,?,?,?,?)');
  for (let n = 1; n <= 3; n++) insert.run('https://example.com/' + n, '달바글로벌', '기사 ' + n, '요약 ' + n, Date.now() + n, Date.now());
  f.failSend(2);
  await assert.rejects(runNewsCheck(f.env), /temporary failure/);
  assert.equal(f.replies.length, 1);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM articles WHERE sent_ms IS NOT NULL').get().n, 1);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM articles WHERE lease_until_ms IS NOT NULL').get().n, 0);
  assert.equal((await runNewsCheck(f.env)).sent, 2);
  assert.equal(f.replies.length, 3);
  assert.equal(new Set(f.replies.map(r => r.text)).size, 3);
});

test('cross-outlet duplicates are suppressed within a batch and across later cron runs', async t => {
  const f = fixture(t);
  const insert = f.sql.prepare('INSERT INTO articles (url,ticker,title,description,pub_ms,discovered_ms) VALUES (?,?,?,?,?,?)');
  const title = '효성중공업 지멘스와 디지털 전력망 기술 협력';
  const description = '효성중공업이 독일 지멘스와 디지털 전력망과 인공지능 데이터센터 솔루션 분야에서 협력한다. 글로벌 전략적 파트너십 협약을 체결했다.';
  const now = Date.parse('2026-12-01T00:00:00Z');
  t.mock.timers.enable({apis:['Date'],now});
  insert.run('https://first.example/news', '효성중공업', title, description, now - 1000, now);
  insert.run('https://second.example/news', '효성중공업', title + '!', description, now, now);
  assert.equal((await runNewsCheck(f.env, now)).sent, 1);
  assert.equal(f.replies.length, 1);
  assert.equal(f.sql.prepare('SELECT duplicate_of FROM articles WHERE url = ?').get('https://second.example/news').duplicate_of, 'https://first.example/news');
  // A later outlet must compare with persisted history, including after a restart.
  insert.run('https://third.example/news', '효성중공업', '[속보] ' + title, description, now + 1, now);
  assert.equal((await runNewsCheck({ ...f.env }, now)).sent, 0);
  assert.equal(f.replies.length, 1);
  // Distinct news about the same company still sends.
  insert.run('https://fourth.example/news', '효성중공업', '효성중공업 미국 공장 증설에 3000억원 투자', '미국 변압기 생산능력 확대를 위한 신규 공장 투자 계획을 발표했다.', now + 2, now);
  assert.equal((await runNewsCheck(f.env, now)).sent, 1);
  assert.equal(f.replies.length, 2);
});

test('old dedup history expires and a failed delivery cannot suppress its retry', async t => {
  const f = fixture(t);
  const now = Date.now();
  const insert = f.sql.prepare('INSERT INTO articles (url,ticker,title,description,pub_ms,discovered_ms,sent_ms) VALUES (?,?,?,?,?,?,?)');
  const title = '달바글로벌 미국 신규 매장 개장';
  insert.run('https://example.com/old', '달바글로벌', title, '', now - 31 * 24 * 3600000, now - 31 * 24 * 3600000, now - 31 * 24 * 3600000);
  insert.run('https://example.com/new', '달바글로벌', title, '', now, now, null);
  f.failSend(1);
  await assert.rejects(runNewsCheck(f.env), /temporary failure/);
  assert.equal(f.sql.prepare('SELECT duplicate_of FROM articles WHERE url = ?').get('https://example.com/new').duplicate_of, null);
  assert.equal((await runNewsCheck(f.env)).sent, 1);
});

test('adaptive pacing persists across restarts and status follows add/remove without delaying commands', async t => {
  const { claimNewsSearch, newsPlan } = await import('../src/news-schedule.js');
  const f = fixture(t), now = Date.now(), companies = await liveWatchlist(f.env);
  assert.equal(newsPlan(companies).queries, 30);
  assert.equal(newsPlan(companies).minutes, 3);
  assert.equal(await claimNewsSearch(f.env, companies, now), true);
  assert.equal(await claimNewsSearch({...f.env}, companies, now + 60000), false);
  assert.equal(await claimNewsSearch(f.env, companies, now + 180000), true);
  await command(f, 'status');
  assert.match(f.replies.at(-1).text, /뉴스 검색 주기 3분/);
  for (let i=0; i<20; i++) await command(f, 'add', '추가회사'+i);
  const larger = await liveWatchlist(f.env);
  assert.equal(newsPlan(larger).minutes, 5);
  assert.equal(await claimNewsSearch(f.env, larger, now + 360000), false);
  assert.equal(await claimNewsSearch(f.env, larger, now + 480000), true);
  for (let i=0; i<20; i++) await command(f, 'remove', '추가회사'+i);
  await command(f, 'status');
  assert.match(f.replies.at(-1).text, /뉴스 검색 주기 3분/);
  assert.equal(await claimNewsSearch(f.env, new Map(), now + 999999), false);
  for(let count=1;count<=300;count++){
    const plan=newsPlan(new Map([['test',Array(count).fill('alias')]]));
    assert.ok(plan.monthlyEstimate <= 620000);
  }
});
test('minute cron keeps polling commands while skipping news before its due time', async t => {
  const {default: worker} = await import('../src/worker.js');
  const f = fixture(t);
  f.sql.prepare('UPDATE news_schedule SET last_attempt_ms = ?').run(Date.now());
  await worker.scheduled({cron:'* * * * *',scheduledTime:Date.now()}, f.env);
  assert.equal(f.searches.length, 0);
  assert.ok(f.calls.some(c=>c.method==='getUpdates'));
});

test('paraphrased syndication is suppressed across runs while a cancellation is delivered', async t => {
  const f=fixture(t), now=Date.parse('2026-12-01T00:00:00Z');
  t.mock.timers.enable({apis:['Date'],now});
  const insert=f.sql.prepare('INSERT INTO articles(url,ticker,title,description,pub_ms,discovered_ms) VALUES(?,?,?,?,?,?)');
  const description='효성중공업이 독일 지멘스와 디지털 전력망과 인공지능 데이터센터 솔루션 분야에서 협력한다. 글로벌 전략적 파트너십 협약을 체결했다.';
  insert.run('https://original.example/news','효성중공업','효성중공업 지멘스와 전략적 파트너십',description,now-1000,now);
  assert.equal((await runNewsCheck(f.env, now)).sent,1);
  insert.run('https://copy.example/news','효성중공업','효성중공업 지멘스와 맞손, 디지털 전력망 확대',description,now,now);
  assert.equal((await runNewsCheck({...f.env}, now)).sent,0);
  assert.equal(f.sql.prepare('SELECT duplicate_of FROM articles WHERE url=?').get('https://copy.example/news').duplicate_of,'https://original.example/news');
  insert.run('https://update.example/news','효성중공업','효성중공업 지멘스와 전략적 파트너십 해지',description,now+1,now);
  assert.equal((await runNewsCheck(f.env, now)).sent,1);
});

test('known Siemens syndication is suppressed even with no history or description; unrelated news sends', async t => {
  const f=fixture(t),now=Date.parse('2026-11-02T01:00Z');
  t.mock.timers.enable({apis:['Date'],now});
  const insert=f.sql.prepare('INSERT INTO articles(url,ticker,title,description,pub_ms,discovered_ms) VALUES(?,?,?,?,?,?)');
  insert.run('https://late.example/gspa','효성중공업','효성중공업 지멘스와 AI 데이터센터 공략 맞손','',now,now);
  assert.equal((await runNewsCheck(f.env,now)).sent,0);
  assert.equal(f.sql.prepare('SELECT duplicate_of FROM articles WHERE url=?').get('https://late.example/gspa').duplicate_of,'event:hyosung-siemens-gspa-2026-10-30');
  insert.run('https://new.example/contract','효성중공업','효성중공업 지멘스와 디지털 전력망 신규 공급 계약','',now,now);
  assert.equal((await runNewsCheck(f.env,now)).sent,1);
});

test('four-day old representative still suppresses a republished article', async t => {
  const f=fixture(t), now=Date.now();
  const insert=f.sql.prepare('INSERT INTO articles(url,ticker,title,description,pub_ms,discovered_ms,sent_ms) VALUES(?,?,?,?,?,?,?)');
  const title='달바글로벌 미국 신규 매장 개장';
  insert.run('https://old.example/story','달바글로벌',title,'',now-4*86400000,now-4*86400000,now-4*86400000);
  insert.run('https://late.example/story','달바글로벌',title,'',now,now,null);
  assert.equal((await runNewsCheck(f.env)).sent,0);
  assert.equal(f.sql.prepare('SELECT duplicate_of FROM articles WHERE url=?').get('https://late.example/story').duplicate_of,'https://old.example/story');
});

test('already received Musinsa appointment is discarded before Telegram even without prior history', async t => {
  const f=fixture(t),now=Date.parse('2026-11-02T01:00Z');
  t.mock.timers.enable({apis:['Date'],now});
  const insert=f.sql.prepare('INSERT INTO articles(url,ticker,title,description,pub_ms,discovered_ms) VALUES(?,?,?,?,?,?)');
  insert.run('https://late.example/musinsa','무신사','지용킴 품은 무신사 스탠다드…글로벌 캐주얼로 체질 개선','',now,now);
  assert.equal((await runNewsCheck(f.env)).sent,0);
  assert.ok(f.sql.prepare('SELECT sent_ms FROM articles WHERE url=?').get('https://late.example/musinsa').sent_ms);
  insert.run('https://new.example/musinsa','무신사','무신사 대표이사 사임','',now,now);
  assert.equal((await runNewsCheck(f.env)).sent,1);
});

test('fashion filter also discards queued Musinsa articles created before deployment', async t => {
  const f=fixture(t),now=Date.now();
  const insert=f.sql.prepare('INSERT INTO articles(url,ticker,title,description,pub_ms,discovered_ms) VALUES(?,?,?,?,?,?)');
  insert.run('https://queued.example/fashion','무신사','무신사 겨울 신제품 컬렉션 공개','지난해 매출이 늘었다.',now,now);
  insert.run('https://queued.example/ipo','무신사','무신사 IPO 예비심사 청구','패션 플랫폼 무신사',now,now);
  assert.equal((await runNewsCheck(f.env)).sent,1);
  assert.equal(f.replies.length,1);
  assert.match(f.replies[0].text,/IPO/);
  assert.ok(f.sql.prepare('SELECT sent_ms FROM articles WHERE url=?').get('https://queued.example/fashion').sent_ms);
});

test('queued PGS article is suppressed without history, but financial news mentioning PGS survives', async t => {
  const f=fixture(t),now=Date.parse('2026-11-02T01:00Z');
  t.mock.timers.enable({apis:['Date'],now});
  const insert=f.sql.prepare('INSERT INTO articles(url,ticker,title,description,pub_ms,discovered_ms) VALUES(?,?,?,?,?,?)');
  insert.run('https://late.example/pgs','파마리서치','파마리서치 PGS 개최…글로벌 재생의학 리더십 강화','',now,now);
  insert.run('https://new.example/earnings','파마리서치','파마리서치 영업이익 증가','PGS 행사도 개최했다.',now+1,now);
  assert.equal((await runNewsCheck(f.env)).sent,1);
  assert.equal(f.sql.prepare('SELECT duplicate_of FROM articles WHERE url=?').get('https://late.example/pgs').duplicate_of,'event:pharmaresearch-pgs-2026-10');
  assert.match(f.replies[0].text,/영업이익/);
});

test('reported LS speech is removed from queue without history and new orders survive', async t => {
 const f=fixture(t),now=Date.parse('2026-11-02T01:00Z');t.mock.timers.enable({apis:['Date'],now});
 const insert=f.sql.prepare('INSERT INTO articles(url,ticker,title,description,pub_ms,discovered_ms) VALUES(?,?,?,?,?,?)');
 insert.run('https://www.viva100.com/article/20261102500194','LS일렉트릭','구자균 LS일렉트릭 회장 “AI 전력난 해법은 지능형 DC 전력망”','',now,now);
 insert.run('https://new.example/order','LS일렉트릭','LS일렉트릭 직류 전력망 공급 계약 체결','구자균 AI 전력난 해법은 지능형 DC 전력망',now+1,now);
 assert.equal((await runNewsCheck(f.env)).sent,1);
 assert.equal(f.sql.prepare('SELECT duplicate_of FROM articles WHERE url=?').get('https://www.viva100.com/article/20261102500194').duplicate_of,'event:ls-electric-koo-ai-dc-grid-2026-11-02');
 assert.match(f.replies[0].text,/공급 계약/);
});
test('other companies cannot crowd relevant duplicate history out of the 2000-row comparison limit', async t => {
 const f=fixture(t),now=Date.now();
 const insert=f.sql.prepare('INSERT INTO articles(url,ticker,title,description,pub_ms,discovered_ms,sent_ms) VALUES(?,?,?,?,?,?,?)');
 insert.run('https://original.example/ls','LS일렉트릭','LS일렉트릭 북미 변압기 생산능력 확대','',now-2*86400000,now,now);
 for(let i=0;i<2001;i++) insert.run('https://busy.example/'+i,'에이피알','에이피알 별도 소식 '+i,'',now-1000,now,now);
 insert.run('https://copy.example/ls','LS일렉트릭','LS일렉트릭 북미 변압기 생산능력 확대','',now,now,null);
 assert.equal((await runNewsCheck(f.env)).sent,0);
 assert.equal(f.sql.prepare('SELECT duplicate_of FROM articles WHERE url=?').get('https://copy.example/ls').duplicate_of,'https://original.example/ls');
});

test('delivery ledger survives loss of article cache and suppresses an outlet copy', async t => {
 const f=fixture(t),now=Date.now();
 const insert=f.sql.prepare('INSERT INTO articles(url,ticker,title,description,pub_ms,discovered_ms) VALUES(?,?,?,?,?,?)');
 const title='에이피알 미국 물류센터 증설';
 insert.run('https://one.example/durable','에이피알',title,'',now,now);
 assert.equal((await runNewsCheck(f.env)).sent,1);
 f.sql.exec('DELETE FROM articles');
 insert.run('https://two.example/durable','에이피알',title,'',now,now);
 assert.equal((await runNewsCheck({...f.env})).sent,0);
 assert.equal(f.replies.length,1);
});
test('same-company history beyond 2000 entries remains available to duplicate checking', async t => {
 const f=fixture(t),now=Date.now();
 const insert=f.sql.prepare('INSERT INTO articles(url,ticker,title,description,pub_ms,discovered_ms,sent_ms) VALUES(?,?,?,?,?,?,?)');
 insert.run('https://old.example/representative','에이피알','에이피알 미국 물류센터 증설','',now-2*86400000,now,now-2*86400000);
 for(let i=0;i<2001;i++)insert.run('https://other.example/'+i,'에이피알','다른 소식 '+i,'',now-1000,now,now-1000);
 insert.run('https://copy.example/representative','에이피알','에이피알 미국 물류센터 증설','',now,now,null);
 assert.equal((await runNewsCheck(f.env)).sent,0);
});
test('timeout after Telegram receives a news message is held instead of being resent', async t => {
 const f=fixture(t),now=Date.now(),previous=globalThis.fetch;
 f.sql.prepare('INSERT INTO articles(url,ticker,title,pub_ms,discovered_ms) VALUES(?,?,?,?,?)').run('https://uncertain.example/news','에이피알','에이피알 미국 물류센터 증설',now,now);
 globalThis.fetch=async(url,options)=>{const response=await previous(url,options);if(String(url).endsWith('/sendMessage'))throw Error('response lost');return response;};
 await assert.rejects(runNewsCheck(f.env),/response lost/);
 globalThis.fetch=previous;
 assert.equal(f.replies.length,1);
 assert.equal(f.sql.prepare('SELECT state FROM news_delivery').get().state,'uncertain');
 assert.equal((await runNewsCheck(f.env)).sent,0);
 assert.equal(f.replies.length,1);
 await command(f,'status');assert.match(f.replies.at(-1).text,/전송 확인 불가: 1건/);
});
test('DB failure after Telegram acceptance cannot cause a retry duplicate', async t => {
 const f=fixture(t),now=Date.now();
 f.sql.prepare('INSERT INTO articles(url,ticker,title,pub_ms,discovered_ms) VALUES(?,?,?,?,?)').run('https://dbfailure.example/news','에이피알','에이피알 미국 물류센터 증설',now,now);
 const prepare=f.env.DB.prepare.bind(f.env.DB);let fail=true;
 f.env.DB.prepare=q=>{if(fail && q.startsWith("UPDATE news_delivery SET state='sent'")){fail=false;throw Error('database temporarily unavailable');}return prepare(q);};
 await assert.rejects(runNewsCheck(f.env),/database temporarily unavailable/);
 assert.equal(f.replies.length,1);
 assert.equal((await runNewsCheck(f.env)).sent,0);
 assert.equal(f.replies.length,1);
});
test('independent delivery lock prevents simultaneous loops sending two outlets of one story', async t => {
 const f=fixture(t),now=Date.now();
 const insert=f.sql.prepare('INSERT INTO articles(url,ticker,title,pub_ms,discovered_ms) VALUES(?,?,?,?,?)');
 insert.run('https://parallel-one.example/news','에이피알','에이피알 미국 물류센터 증설',now,now);
 insert.run('https://parallel-two.example/news','에이피알','에이피알 미국 물류센터 증설',now,now);
 const results=await Promise.all([runNewsCheck(f.env),runNewsCheck(f.env)]);
 assert.equal(results.reduce((n,r)=>n+r.sent,0),1);assert.equal(f.replies.length,1);
});

test('queued SK appointment round is suppressed but a different person still sends', async t=>{
 const f=fixture(t),now=Date.parse('2026-11-02T01:00Z');t.mock.timers.enable({apis:['Date'],now});
 const insert=f.sql.prepare('INSERT INTO articles(url,ticker,title,description,pub_ms,discovered_ms) VALUES(?,?,?,?,?,?)');
 insert.run('https://late.example/sk','sk이노베이션','SK이노베이션 전력 사업 강화…정승일 총괄사장 선임','',now,now);
 insert.run('https://new.example/sk','sk이노베이션','SK이노베이션 김철수 사장 선임','',now+1,now);
 assert.equal((await runNewsCheck(f.env)).sent,1);
 assert.equal(f.sql.prepare('SELECT duplicate_of FROM articles WHERE url=?').get('https://late.example/sk').duplicate_of,'event:sk-innovation-2027-personnel-2026-10-30');
 assert.match(f.replies[0].text,/김철수/);
});
