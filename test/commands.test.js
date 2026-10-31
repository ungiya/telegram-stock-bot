import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { authorized, handleCommand, liveWatchlist, pollCommands, withBotLock } from '../src/commands.js';
import { runNewsCheck } from '../src/worker.js';

function fixture(t, destination = '111') {
  const sql = new DatabaseSync(':memory:');
  for (const name of ['0001_init.sql', '0002_commands.sql', '0003_reports.sql']) sql.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
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
  let updates = [], news = [], member = 'member';
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
    if (method === 'sendMessage') replies.push(params);
    return Response.json({ ok: true, result });
  };
  t.after(() => { globalThis.fetch = originalFetch; sql.close(); });
  const env = { DB, TELEGRAM_CHAT_ID: destination, TELEGRAM_BOT_TOKEN: 'test-only', NAVER_CLIENT_ID: 'test', NAVER_CLIENT_SECRET: 'test' };
  return { env, sql, calls, replies, searches, setUpdates: value => { updates = value; }, setNews: value => { news = value; }, setMember: value => { member = value; } };
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
