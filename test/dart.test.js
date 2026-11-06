import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { DART_CRON, diagnoseDartRequest, runDartCheck, matchDartCompany, normalizeFiling, kstDate } from '../src/dart.js';
import { handleCommand } from '../src/commands.js';
import { runKindCheck, DART_PRIORITY_WAIT_MS } from '../src/kind.js';
import worker from '../src/worker.js';

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  for (const name of readdirSync(new URL('../migrations/', import.meta.url)).filter(n => n.endsWith('.sql')).sort())
    sql.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  const DB = { prepare(query) {
    const statement = (values = []) => ({ bind: (...args) => statement(args), first: async () => sql.prepare(query).get(...values) || null,
      all: async () => ({ results: sql.prepare(query).all(...values) }), run: async () => sql.prepare(query).run(...values) });
    return statement();
  }, async batch(statements) { sql.exec('BEGIN'); try { const result = []; for (const statement of statements) result.push(await statement.run()); sql.exec('COMMIT'); return result; } catch (e) { sql.exec('ROLLBACK'); throw e; } } };
  const original = globalThis.fetch, replies = [], queries = [];
  let pages = [[]], failure = '', sendFailure = false, hook, redirects = [], documentBody = '';
  let failPart = 0;
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.pathname === '/api/document.xml') return new Response('<result><status>014</status></result>');
    if (parsed.hostname === 'dart.fss.or.kr') {
      if(!documentBody)return new Response('',{status:503});
      if(parsed.pathname.includes('main.do')) return new Response('viewDoc("'+parsed.searchParams.get('rcpNo')+'", "123", "0", "0", "0", "HTML")');
      return new Response('<html><body><p>'+documentBody+'</p></body></html>');
    }
    if (parsed.hostname === 'opendart.fss.or.kr') {
      // Match Workers, which rejects redirect:error before making any network request.
      if (!['manual', 'follow'].includes(options.redirect)) throw new TypeError('Unsupported redirect mode');
      assert.equal(options.redirect, 'manual');
      assert.equal(typeof url, 'string');
      assert.equal(options.method, 'GET');
      assert.match(options.headers['User-Agent'], /telegram-stock-news-alert/);
      assert.equal(options.headers.Accept, 'application/json');
      queries.push(parsed);
      if (hook) await hook();
      if (redirects.length) return new Response(null, { status: 302, headers: { Location: redirects.shift() } });
      if (failure === 'network') throw new Error('sensitive URL ' + url);
      if (failure === 'redirect') return new Response(null, { status: 302, headers: { Location: 'https://example.com/blocked' } });
      if (failure) return Response.json({ status: failure });
      const number = Number(parsed.searchParams.get('page_no'));
      return Response.json({ status: '000', total_page: pages.length, list: pages[number - 1] || [] });
    }
    if (parsed.hostname === 'api.telegram.org') {
      if (failPart && replies.length + 1 === failPart) { failPart=0; return Response.json({ok:false},{status:500}); }
      if (sendFailure) return Response.json({ ok: false }, { status: 500 });
      const body = JSON.parse(options.body); replies.push(body); return Response.json({ ok: true, result: {} });
    }
    throw Error('Unexpected host');
  };
  t.after(() => { globalThis.fetch = original; sql.close(); });
  return { sql, replies, queries, env: { DB, DART_API_KEY: 'test-dart-secret', TELEGRAM_BOT_TOKEN: 'test-bot-secret', TELEGRAM_CHAT_ID: '111' },
    setDocument: value => { documentBody=value; }, failPart: value => { failPart=value; },
    setRedirects: value => { redirects = value; }, setPages: value => { pages = value; }, fail: value => { failure = value; }, failSend: value => { sendFailure = value; }, setHook: value => { hook = value; } };
}
const NOW = Date.parse('2026-11-02T01:00:00Z');
const filing = (id, report = '단일판매ㆍ공급계약체결', name = '효성중공업') => ({ corp_name: name, rcept_no: id, rcept_dt: '20261102', report_nm: report });
const old = filing('20261102000001'), fresh = filing('20261102000002');
const dm = text => ({ text, from: { id: 111 }, chat: { id: 111, type: 'private' } });

test('DART names match legal names/aliases exactly; malformed receipts are rejected', () => {
  const companies = new Map([['LS일렉트릭', ['LS ELECTRIC']], ['씨어스', []], ['리디', []]]);
  assert.equal(matchDartCompany('(주)LS ELECTRIC', companies), 'LS일렉트릭');
  assert.equal(matchDartCompany('씨어스테크놀로지', companies), '씨어스');
  assert.equal(matchDartCompany('리디파트너스', companies), null);
  assert.equal(normalizeFiling(filing('invalid', '실적', '리디'), companies), null);
  assert.equal(kstDate(Date.parse('2026-11-01T15:01:00Z')), '20261102');
});
test('no key means no external calls or impact on existing scheduled jobs', async t => {
  const f = fixture(t);
  assert.deepEqual(await runDartCheck({}), { enabled: false, sent: 0 });
  await worker.scheduled({ cron: DART_CRON }, {});
  assert.equal(f.queries.length, 0);
});
test('first snapshot is silent; new filings and amendments send exactly once with original links', async t => {
  const f = fixture(t); f.setPages([[old]]);
  assert.equal((await runDartCheck(f.env, NOW)).sent, 0);
  const amended = filing('20261102000003', '[기재정정]단일판매ㆍ공급계약체결');
  f.setPages([[amended, fresh, old]]);
  assert.equal((await runDartCheck(f.env, NOW + 60000)).sent, 2);
  assert.match(f.replies[0].text, /^\[공시\] \[효성중공업\]/);
  assert.match(f.replies[0].text, /https:\/\/dart.fss.or.kr\/dsaf001\/main.do\?rcpNo=20261102000002$/);
  assert.match(f.replies[1].text, /기재정정/);
  assert.equal((await runDartCheck(f.env, NOW + 120000)).sent, 0);
  assert.equal(f.queries[0].searchParams.get('last_reprt_at'), 'N');
  assert.equal(f.queries[0].searchParams.get('bgn_de'), '20261101');
});
test('API failures neither initialize subscriptions nor leak the authentication key', async t => {
  const f = fixture(t); f.fail('network');
  await assert.rejects(runDartCheck(f.env, NOW), /DART network request failed/);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM dart_topics WHERE initialized_at IS NOT NULL').get().n, 0);
  assert.doesNotMatch(f.sql.prepare('SELECT last_summary FROM dart_runtime').get().last_summary, /secret/);
  assert.equal(f.sql.prepare('SELECT lock_until_ms FROM dart_runtime').get().lock_until_ms, 0);
  f.fail('020');
  await assert.rejects(runDartCheck(f.env, NOW + 60000), /DART API status 020/);
});
test('failed sends retry successfully, independent of new searches and pause/resume', async t => {
  const f = fixture(t); f.setPages([[old]]); await runDartCheck(f.env, NOW);
  f.setPages([[fresh, old]]); f.failSend(true);
  await assert.rejects(runDartCheck(f.env, NOW + 60000), /Telegram sendMessage status 500/);
  f.failSend(false);
  f.sql.exec('UPDATE bot_runtime SET paused = 1');
  assert.equal((await runDartCheck(f.env, NOW + 120000)).sent, 0);
  f.sql.exec('UPDATE bot_runtime SET paused = 0');
  assert.equal((await runDartCheck(f.env, NOW + 180000)).sent, 1);
});
test('remove/add commands share DART subscriptions and suppress pending removals', async t => {
  const f = fixture(t); f.setPages([[old]]); await runDartCheck(f.env, NOW);
  f.sql.exec('UPDATE bot_runtime SET paused = 1');
  f.setPages([[fresh, old]]); await runDartCheck(f.env, NOW + 60000);
  await handleCommand(f.env, dm('/remove 효성중공업'), { name: 'remove', arg: '효성중공업' });
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM dart_topics WHERE ticker = ?').get('효성중공업').n, 0);
  assert.ok(f.sql.prepare('SELECT sent_ms FROM dart_filings WHERE receipt_no = ?').get(fresh.rcept_no).sent_ms);
  await handleCommand(f.env, dm('/add 효성중공업'), { name: 'add', arg: '효성중공업' });
  f.sql.exec('UPDATE bot_runtime SET paused = 0');
  assert.equal((await runDartCheck(f.env, NOW + 120000)).sent, 0);
});
test('pagination is bounded, resumes after a restart and always checks the newest page', async t => {
  const f = fixture(t);
  f.setPages(Array.from({ length: 10 }, (_, i) => [filing('2026110200' + String(i + 1).padStart(4, '0'))]));
  assert.equal((await runDartCheck(f.env, NOW)).complete, false);
  assert.equal(f.queries.length, 8);
  assert.equal(f.sql.prepare('SELECT next_page FROM dart_runtime').get().next_page, 9);
  const second = await runDartCheck({ ...f.env }, NOW + 60000);
  assert.equal(second.complete, true);
  assert.equal(second.sent, 0);
  assert.deepEqual(f.queries.slice(8).map(q => q.searchParams.get('page_no')), ['1', '9', '10']);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM dart_filings').get().n, 10);
});
test('overlapping DART runs cannot send the same filing simultaneously', async t => {
  const f = fixture(t); f.setPages([[old]]); await runDartCheck(f.env, NOW);
  let skipped;
  f.setPages([[fresh, old]]); f.setHook(async () => { f.setHook(null); skipped = await runDartCheck(f.env, NOW + 60000); });
  assert.equal((await runDartCheck(f.env, NOW + 60000)).sent, 1);
  assert.equal(skipped.skipped, true);
  assert.equal(f.replies.length, 1);
});
test('a watchlist edit during collection prevents delivery to the removed subscription', async t => {
  const f = fixture(t); f.setPages([[old]]); await runDartCheck(f.env, NOW);
  f.setPages([[fresh, old]]);
  f.setHook(async () => { f.setHook(null); f.sql.prepare('INSERT INTO watchlist_overrides(ticker,aliases_json,enabled) VALUES(?,?,0)').run('효성중공업', '[]'); });
  assert.equal((await runDartCheck(f.env, NOW + 60000)).sent, 0);
  assert.equal(f.replies.length, 0);
});

test('new subscriptions restart a partial page cycle to baseline all their older filings', async t => {
  const f = fixture(t);
  const pages = Array.from({ length: 10 }, (_, i) => [filing('2026110200' + String(i + 1).padStart(4, '0'))]);
  f.setPages(pages); await runDartCheck(f.env, NOW);
  assert.equal(f.sql.prepare('SELECT next_page FROM dart_runtime').get().next_page, 9);
  await handleCommand(f.env, dm('/add 테스트기업'), { name: 'add', arg: '테스트기업' });
  f.replies.length = 0;
  pages[1].push(filing('20261102000999', '사업보고서', '테스트기업'));
  f.setPages(pages);
  await runDartCheck(f.env, NOW + 60000);
  assert.equal(f.queries[9].searchParams.get('page_no'), '2');
  await runDartCheck(f.env, NOW + 120000);
  assert.equal(f.replies.length, 0);
  assert.ok(f.sql.prepare('SELECT sent_ms FROM dart_filings WHERE receipt_no = ?').get('20261102000999').sent_ms);
});
test('status reports key registration and collection state without exposing credentials', async t => {
  const f = fixture(t);
  await handleCommand(f.env, dm('/status'), { name: 'status', arg: '' });
  assert.match(f.replies.at(-1).text, /공시: 인증키 등록됨/);
  assert.doesNotMatch(f.replies.at(-1).text, /test-dart-secret|test-bot-secret/);
  await handleCommand({ ...f.env, DART_API_KEY: undefined }, dm('/status'), { name: 'status', arg: '' });
  assert.match(f.replies.at(-1).text, /DART_API_KEY 등록 대기/);
});

test('DART redirects are not followed and do not expose the key in errors', async t => {
  const f = fixture(t); f.fail('redirect');
  await assert.rejects(runDartCheck(f.env, NOW), /DART HTTP 302 redirect outside API/);
  assert.equal(f.queries.length, 1);
  assert.equal(f.replies.length, 0);
  assert.doesNotMatch(f.sql.prepare('SELECT last_summary FROM dart_runtime').get().last_summary, /test-dart-secret/);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM dart_topics WHERE initialized_at IS NOT NULL').get().n, 0);
});

test('same-endpoint HTTPS redirects retain the original key and query and complete successfully', async t => {
  const f = fixture(t); f.setPages([[old]]);
  f.setRedirects(['/api/list.json?crtfc_key=wrong&page_count=1']);
  assert.equal((await runDartCheck(f.env, NOW)).complete, true);
  assert.equal(f.queries.length, 2);
  assert.equal(f.queries[1].searchParams.get('crtfc_key'), 'test-dart-secret');
  assert.equal(f.queries[1].searchParams.get('page_count'), '100');
});
test('login/error redirects report the destination without following it or exposing the key', async t => {
  const f = fixture(t);
  f.setRedirects(['/error.do?crtfc_key=test-dart-secret']);
  await assert.rejects(runDartCheck(f.env, NOW), /redirect outside API: https:\/\/opendart.fss.or.kr\/error.do/);
  assert.equal(f.queries.length, 1);
  assert.doesNotMatch(f.sql.prepare('SELECT last_summary FROM dart_runtime').get().last_summary, /test-dart-secret|crtfc_key/);
});
test('HTTPS downgrade, credentials and reflected keys are never followed or logged', async t => {
  const f = fixture(t);
  for (const destination of ['http://opendart.fss.or.kr/api/list.json', 'https://user:pass@opendart.fss.or.kr/api/list.json', 'https://test-dart-secret.example.com/test-dart-secret?key=test-dart-secret']) {
    f.setRedirects([destination]);
    await assert.rejects(runDartCheck(f.env, NOW), /redirect outside API/);
    assert.doesNotMatch(f.sql.prepare('SELECT last_summary FROM dart_runtime').get().last_summary, /test-dart-secret|user:pass/);
  }
  assert.equal(f.queries.length, 3);
});
test('redirect loops are bounded and leave subscriptions uninitialized', async t => {
  const f = fixture(t); f.setRedirects(['/api/list.json', '/api/list.json', '/api/list.json']);
  await assert.rejects(runDartCheck(f.env, NOW), /redirect limit exceeded/);
  assert.equal(f.queries.length, 3);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM dart_topics WHERE initialized_at IS NOT NULL').get().n, 0);
});

test('error1 triggers one minimal control request without advancing baseline or sending', async t => {
  const f = fixture(t);
  f.setRedirects(['/error1.html']);
  await assert.rejects(runDartCheck(f.env, NOW), /최소 요청 정상.*검색 조건을 포함한 요청만 실패/);
  assert.equal(f.queries.length, 2);
  assert.deepEqual([...f.queries[1].searchParams.keys()], ['crtfc_key', 'page_count']);
  assert.equal(f.queries[1].searchParams.get('page_count'), '1');
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM dart_topics WHERE initialized_at IS NOT NULL').get().n, 0);
  assert.equal(f.replies.length, 0);
  f.setRedirects(['/error1.html', 'https://example.com/?secret=never-follow']);
  await assert.rejects(runDartCheck(f.env, NOW + 60000), /최소 요청도 HTTP 302/);
  assert.equal(f.queries.length, 4);
});
test('control request reports API codes and never exposes bodies, keys or network errors', async t => {
  const f = fixture(t);
  f.fail('013'); assert.match(await diagnoseDartRequest(f.env), /최소 요청 정상/);
  f.fail('010'); assert.equal(await diagnoseDartRequest(f.env), '최소 요청 API 010');
  f.fail('sensitive-test-secret'); assert.equal(await diagnoseDartRequest(f.env), '최소 요청 API unknown');
  f.fail('network'); assert.equal(await diagnoseDartRequest(f.env), '최소 요청도 연결 또는 응답 해석 실패');
});


test('summary is cached and retried after an explicit send failure', async t => {
 const f=fixture(t);f.setPages([[old]]);await runDartCheck(f.env,NOW);
 f.setDocument('계약상대 | 테스트회사\n계약금액(원) | 100000000\n'+'부연설명 '.repeat(1000));f.setPages([[fresh,old]]);f.failPart(1);
 await assert.rejects(runDartCheck(f.env,NOW+60000),/Telegram/);
 assert.equal(f.replies.length,0);
 const d=f.sql.prepare('SELECT * FROM dart_body_delivery WHERE receipt_no=?').get(fresh.rcept_no);
 assert.equal(JSON.parse(d.messages_json).length,1);assert.equal(d.next_part,0);
 assert.equal((await runDartCheck(f.env,NOW+120000)).sent,1);
 assert.match(f.replies[0].text,/핵심 항목/);assert.ok(f.replies[0].text.length<2000);
});
test('legacy full-body messages already started do not continue after summary rollout',async t=>{
 const f=fixture(t);f.setPages([[old]]);await runDartCheck(f.env,NOW);
 f.sql.exec('UPDATE bot_runtime SET paused=1');f.setPages([[fresh,old]]);await runDartCheck(f.env,NOW+60000);
 f.sql.prepare('INSERT INTO dart_body_delivery(receipt_no,messages_json,next_part) VALUES(?,?,1)').run(fresh.rcept_no,JSON.stringify(['old part one','old part two']));
 f.sql.exec('UPDATE bot_runtime SET paused=0');await runDartCheck(f.env,NOW+120000);
 assert.equal(f.replies.length,0);assert.ok(f.sql.prepare('SELECT sent_ms FROM dart_filings WHERE receipt_no=?').get(fresh.rcept_no).sent_ms);
});



test('DART does not repeat KIND preliminary earnings filed under a different receipt',async t=>{
 const f=fixture(t);
 f.setPages([[old]]);
 await runDartCheck(f.env,NOW); // initial DART baseline
 const report='연결재무제표기준영업(잠정)실적(공정공시)';
 f.sql.prepare('INSERT INTO kind_items(event_key,receipt,ticker,body,event_date,sent_ms,created_ms) VALUES(?,?,?,?,?,?,?)')
  .run('disclosure:20261102000051','20261102000051','효성중공업',
   '[KIND 공시] [효성중공업] '+report+'\n공시일: 2026-11-02\nhttps://kind.krx.co.kr/',
   '2026-11-02',NOW,NOW);
 const freshEarnings=filing('20261102000052',report);
 f.setPages([[freshEarnings,old]]);
 const result=await runDartCheck(f.env,NOW+60000);
 assert.equal(result.sent,0,'DART should skip prior KIND notification for same preliminary earnings');
 assert.equal(f.replies.length,0);
 assert.ok(f.sql.prepare('SELECT sent_ms FROM dart_filings WHERE receipt_no=?').get(freshEarnings.rcept_no).sent_ms);
 const unrelated=filing('20261102000053','단일판매ㆍ공급계약체결');
 f.setPages([[unrelated,freshEarnings,old]]);
 assert.equal((await runDartCheck(f.env,NOW+120000)).sent,1);
 assert.match(f.replies[0].text,/공급계약/);
});

test('DART earnings after KIND stale or active claim is safely retried and never double-sent',async t=>{
 const f=fixture(t),report='연결재무제표기준영업(잠정)실적(공정공시)';
 f.setPages([[old]]);await runDartCheck(f.env,NOW);
 const item=filing('20261102000054',report);
 const key='earnings-prelim:'+encodeURIComponent('효성중공업')+':20261102:consolidated';
 f.sql.prepare('INSERT INTO disclosure_deliveries(event_key,source,receipt,claimed_ms,delivered_ms) VALUES(?,?,?,?,NULL)')
  .run(key,'kind','KIND-RECEIPT',NOW+59000);
 f.setPages([[item,old]]);
 assert.equal((await runDartCheck(f.env,NOW+60000)).sent,0);
 assert.equal(f.replies.length,0);
 assert.equal(f.sql.prepare('SELECT sent_ms FROM dart_filings WHERE receipt_no=?').get(item.rcept_no).sent_ms,null);
 // A stale KIND claim can be safely reclaimed by DART.
 assert.equal((await runDartCheck(f.env,NOW+5*60000)).sent,1);
 assert.equal(f.replies.length,1);
 const receipt=f.sql.prepare('SELECT source,delivered_ms FROM disclosure_deliveries WHERE event_key=?').get(key);
 assert.equal(receipt.source,'dart');
 assert.ok(receipt.delivered_ms>0);
 assert.equal((await runDartCheck(f.env,NOW+6*60000)).sent,0);
});



test('Nov 6 DART first: two companies each send one detailed ownership filing; KIND copies stay silent',async t=>{
 const f=fixture(t),now=Date.parse('2026-11-06T07:25:00Z'),slot=Math.floor(now/300000)*300000;
 const report='주식등의대량보유상황보고서(약식)';
 const filings=[
  {corp_name:'서진시스템',rcept_no:'20261106000359',rcept_dt:'20261106',report_nm:report},
  {corp_name:'한중엔시에스',rcept_no:'20261106000366',rcept_dt:'20261106',report_nm:report}
 ];
 const kind=[
  {id:'20261106000804',company:'서진시스템',title:report,eventDate:'2026-11-06',
   url:'https://kind.krx.co.kr/common/disclsviewer.do?method=search&acptno=20261106000804&docno=&viewerhost='},
  {id:'20261106000809',company:'한중엔시에스',title:report,eventDate:'2026-11-06',
   url:'https://kind.krx.co.kr/common/disclsviewer.do?method=search&acptno=20261106000809&docno=&viewerhost='}
 ];
 f.setPages([[filing('20261106000001')]]);await runDartCheck(f.env,now); // initial DART baseline
 await runKindCheck(f.env,slot,{now,collector:async()=>[]}); // initial KIND baseline
 f.setPages([[...filings,filing('20261106000001')]]);
 const sent=await runDartCheck(f.env,now+60000);
 assert.equal(sent.sent,2);
 assert.equal(f.replies.length,2);
 assert.match(f.replies[0].text,/서진시스템/);
 assert.match(f.replies[1].text,/한중엔시에스/);
 const copy=await runKindCheck(f.env,slot,{now:now+61000,collector:async()=>kind});
 assert.equal(copy.sent,0);
 assert.equal(f.replies.length,2,'both KIND copies are suppressed');
 const rows=f.sql.prepare('SELECT ticker,sent_ms FROM kind_items WHERE receipt IS NOT NULL ORDER BY ticker').all();
 assert.equal(rows.length,2);assert.ok(rows.every(x=>x.sent_ms!==null));
 // An amendment of the same report is a material new disclosure.
 f.setPages([[{corp_name:'서진시스템',rcept_no:'20261106000360',rcept_dt:'20261106',
  report_nm:'[기재정정]'+report},...filings]]);
 assert.equal((await runDartCheck(f.env,now+120000)).sent,1);
 assert.match(f.replies.at(-1).text,/기재정정/);
});

test('Nov 6 KIND-only fallback after 30-minute DART priority window; very late DART copies stay silent',async t=>{
 const f=fixture(t),now=Date.parse('2026-11-06T07:25:00Z'),slot=Math.floor(now/300000)*300000;
 const report='주식등의대량보유상황보고서(약식)';
 const kind=[
  {id:'20261106000804',company:'서진시스템',title:report,eventDate:'2026-11-06',
   url:'https://kind.krx.co.kr/common/disclsviewer.do?method=search&acptno=20261106000804&docno=&viewerhost='},
  {id:'20261106000809',company:'한중엔시에스',title:report,eventDate:'2026-11-06',
   url:'https://kind.krx.co.kr/common/disclsviewer.do?method=search&acptno=20261106000809&docno=&viewerhost='}
 ];
 await runKindCheck(f.env,slot,{now,collector:async()=>[]});
 f.setPages([[filing('20261106000001')]]);await runDartCheck(f.env,now);
 assert.equal((await runKindCheck(f.env,slot,{now:now+60000,collector:async()=>kind})).sent,0,
  'KIND waits briefly for a full DART filing');
 assert.equal((await runKindCheck(f.env,slot,{now:now+DART_PRIORITY_WAIT_MS,collector:async()=>kind})).sent,0);
 assert.equal((await runKindCheck(f.env,slot,{now:now+60000+DART_PRIORITY_WAIT_MS,collector:async()=>kind})).sent,2);
 assert.equal(f.replies.length,2);
 f.setPages([[
  {corp_name:'서진시스템',rcept_no:'20261106000359',rcept_dt:'20261106',report_nm:report},
  {corp_name:'한중엔시에스',rcept_no:'20261106000366',rcept_dt:'20261106',report_nm:report}
 ]]);
 assert.equal((await runDartCheck(f.env,now+120000+DART_PRIORITY_WAIT_MS)).sent,0);
 assert.equal(f.replies.length,2);
 const sent=f.sql.prepare('SELECT sent_ms FROM dart_filings WHERE receipt_no IN (?,?)')
  .all('20261106000359','20261106000366');
 assert.equal(sent.length,2);assert.ok(sent.every(x=>x.sent_ms!==null));
});



test('KIND discovered before DART: queued matching DART has permanent priority, even past KIND fallback timeout',async t=>{
 const f=fixture(t),now=Date.parse('2026-11-06T07:25:00Z'),slot=Math.floor(now/300000)*300000;
 const report='주식등의대량보유상황보고서(약식)';
 const filings=[
  {corp_name:'서진시스템',rcept_no:'20261106000359',rcept_dt:'20261106',report_nm:report},
  {corp_name:'한중엔시에스',rcept_no:'20261106000366',rcept_dt:'20261106',report_nm:report}
 ];
 const kind=[
  {id:'20261106000804',company:'서진시스템',title:report,eventDate:'2026-11-06',
   url:'https://kind.krx.co.kr/common/disclsviewer.do?method=search&acptno=20261106000804'},
  {id:'20261106000809',company:'한중엔시에스',title:report,eventDate:'2026-11-06',
   url:'https://kind.krx.co.kr/common/disclsviewer.do?method=search&acptno=20261106000809'}
 ];
 await runKindCheck(f.env,slot,{now,collector:async()=>[]});
 f.setPages([[filing('20261106000001')]]);await runDartCheck(f.env,now);
 assert.equal((await runKindCheck(f.env,slot,{now:now+60000,collector:async()=>kind})).sent,0);
 f.sql.exec('UPDATE bot_runtime SET paused=1');
 f.setPages([[...filings,filing('20261106000001')]]);
 assert.equal((await runDartCheck(f.env,now+120000)).sent,0);
 assert.equal(f.sql.prepare("SELECT count(*) AS n FROM dart_filings WHERE sent_ms IS NULL AND ticker IN ('서진시스템','한중엔시에스')").get().n,2);
 f.sql.exec('UPDATE bot_runtime SET paused=0');
 assert.equal((await runKindCheck(f.env,slot,{
  now:now+DART_PRIORITY_WAIT_MS+300000,collector:async()=>kind
 })).sent,0,'KIND cannot overtake a DART filing present in its queue');
 assert.equal(f.replies.length,0);
 assert.equal((await runDartCheck(f.env,now+DART_PRIORITY_WAIT_MS+360000)).sent,2);
 assert.equal(f.replies.length,2);
 assert.ok(f.replies.every(x=>x.text.startsWith('[공시]')),'only DART source delivered');
 assert.equal((await runKindCheck(f.env,slot,{
  now:now+DART_PRIORITY_WAIT_MS+420000,collector:async()=>kind
 })).sent,0);
 assert.equal(f.replies.length,2);
 assert.deepEqual(f.sql.prepare('SELECT source FROM disclosure_deliveries ORDER BY event_key').all().map(x=>x.source),
  ['dart','dart']);
});

test('KIND waits for any pending DART receipt, including non-shared reports',async t=>{
 const f=fixture(t),now=Date.parse('2026-11-06T07:25:00Z'),slot=Math.floor(now/300000)*300000;
 await runKindCheck(f.env,slot,{now,collector:async()=>[]});
 const kind={id:'20261106000077',company:'효성중공업',title:'단일판매ㆍ공급계약체결',
  eventDate:'2026-11-06',url:'https://kind.krx.co.kr/disclosure/77'};
 f.sql.prepare('INSERT INTO dart_filings(receipt_no,ticker,company_name,report_name,filed_date,discovered_ms,sent_ms) VALUES(?,?,?,?,?,?,NULL)')
  .run(kind.id, '효성중공업','효성중공업',kind.title,'20261106',now);
 assert.equal((await runKindCheck(f.env,slot,{now:now+60000,collector:async()=>[kind]})).sent,0);
 assert.equal((await runKindCheck(f.env,slot,{now:now+DART_PRIORITY_WAIT_MS+60000,collector:async()=>[kind]})).sent,0);
 assert.equal(f.replies.length,0);
});



test('ordinary supply-contract disclosure: KIND first, DART later with different receipt, only DART alerts',async t=>{
 const f=fixture(t),now=Date.parse('2026-11-06T07:25:00Z'),slot=Math.floor(now/300000)*300000;
 const report='단일판매ㆍ공급계약체결';
 const kind={id:'20261106000881',company:'효성중공업',title:report,eventDate:'2026-11-06',
   url:'https://kind.krx.co.kr/common/disclsviewer.do?method=search&acptno=20261106000881'};
 await runKindCheck(f.env,slot,{now,collector:async()=>[]});
 f.setPages([[filing('20261106000001')]]); await runDartCheck(f.env,now);
 assert.equal((await runKindCheck(f.env,slot,{now:now+60000,collector:async()=>[kind]})).sent,0);
 f.setPages([[
  {corp_name:'효성중공업',rcept_no:'20261106000391',rcept_dt:'20261106',report_nm:report}
 ]]);
 assert.equal((await runDartCheck(f.env,now+120000)).sent,1);
 assert.equal(f.replies.length,1);
 assert.match(f.replies[0].text,/^\[공시\] \[효성중공업\]/);
 assert.match(f.replies[0].text,/dart\.fss\.or\.kr/);
 assert.equal((await runKindCheck(f.env,slot,{
  now:now+DART_PRIORITY_WAIT_MS+120000,collector:async()=>[kind]
 })).sent,0);
 assert.equal(f.replies.length,1);
 assert.equal(f.sql.prepare('SELECT source FROM disclosure_deliveries').get().source,'dart');
});
