import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { DART_CRON, runDartCheck, matchDartCompany, normalizeFiling, kstDate } from '../src/dart.js';
import { handleCommand } from '../src/commands.js';
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
  let pages = [[]], failure = '', sendFailure = false, hook;
  globalThis.fetch = async (url, options) => {
    const parsed = new URL(url);
    if (parsed.hostname === 'opendart.fss.or.kr') {
      // Match Workers, which rejects redirect:error before making any network request.
      if (!['manual', 'follow'].includes(options.redirect)) throw new TypeError('Unsupported redirect mode');
      assert.equal(options.redirect, 'manual');
      queries.push(parsed);
      if (hook) await hook();
      if (failure === 'network') throw new Error('sensitive URL ' + url);
      if (failure === 'redirect') return new Response(null, { status: 302, headers: { Location: 'https://example.com/blocked' } });
      if (failure) return Response.json({ status: failure });
      const number = Number(parsed.searchParams.get('page_no'));
      return Response.json({ status: '000', total_page: pages.length, list: pages[number - 1] || [] });
    }
    if (parsed.hostname === 'api.telegram.org') {
      if (sendFailure) return Response.json({ ok: false }, { status: 500 });
      const body = JSON.parse(options.body); replies.push(body); return Response.json({ ok: true, result: {} });
    }
    throw Error('Unexpected host');
  };
  t.after(() => { globalThis.fetch = original; sql.close(); });
  return { sql, replies, queries, env: { DB, DART_API_KEY: 'test-dart-secret', TELEGRAM_BOT_TOKEN: 'test-bot-secret', TELEGRAM_CHAT_ID: '111' },
    setPages: value => { pages = value; }, fail: value => { failure = value; }, failSend: value => { sendFailure = value; }, setHook: value => { hook = value; } };
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
  await assert.rejects(runDartCheck(f.env, NOW), /DART HTTP status 302/);
  assert.equal(f.queries.length, 1);
  assert.equal(f.replies.length, 0);
  assert.doesNotMatch(f.sql.prepare('SELECT last_summary FROM dart_runtime').get().last_summary, /test-dart-secret|example.com/);
  assert.equal(f.sql.prepare('SELECT count(*) AS n FROM dart_topics WHERE initialized_at IS NOT NULL').get().n, 0);
});
