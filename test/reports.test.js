import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { reportSlot, reportSignature, matchReport, runReportCheck, sendReportAlerts } from '../src/reports.js';
import { parseTable, parseHana, parseKorea, parseNh, parseKb, reportDetail, requestBudget } from '../src/report-collectors.js';

function fixture(t) {
  const sql = new DatabaseSync(':memory:');
  for (const name of ['0001_init.sql', '0002_commands.sql', '0003_reports.sql', '0004_news_descriptions.sql', '0005_news_dedup.sql', '0006_dart.sql']) sql.exec(readFileSync(new URL('../migrations/' + name, import.meta.url), 'utf8'));
  const DB = { prepare(query) {
    const statement = (values = []) => ({ bind: (...args) => statement(args), first: async () => sql.prepare(query).get(...values) || null,
      all: async () => ({ results: sql.prepare(query).all(...values) }), run: async () => sql.prepare(query).run(...values) }); return statement();
  }, async batch(statements) {
    sql.exec('BEGIN'); try { const result = []; for (const s of statements) result.push(await s.run()); sql.exec('COMMIT'); return result; }
    catch (e) { sql.exec('ROLLBACK'); throw e; }
  } };
  const sent = []; let sendFailure = false;
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    if (sendFailure) return Response.json({ ok: false }, { status: 400 });
    sent.push(JSON.parse(options.body)); return Response.json({ ok: true, result: {} });
  };
  t.after(() => { globalThis.fetch = original; sql.close(); });
  const request = async () => { throw Error('unexpected network request'); }; request.remaining = () => 40;
  return { env: { DB, TELEGRAM_CHAT_ID: '111', TELEGRAM_BOT_TOKEN: 'test-only' }, sql, sent, request, failSend: value => { sendFailure = value; } };
}
const morning = Date.parse('2026-11-01T08:00:00+09:00');
const later = Date.parse('2026-11-01T18:00:00+09:00');
const report = (title, broker = '삼성증권', suffix = '1') => ({ title, broker, date: '2026-11-01', url: 'https://example.com/report-' + suffix });

test('report slots match KST 08/18/23, including UTC date rollover and bounded retries', () => {
  assert.equal(reportSlot(morning), '2026-11-01:8');
  assert.equal(reportSlot(later), '2026-11-01:18');
  assert.equal(reportSlot(Date.parse('2026-11-01T23:14:59+09:00')), '2026-11-01:23');
  assert.equal(reportSlot(Date.parse('2026-11-01T23:15:00+09:00')), null);
  assert.equal(reportSlot(morning - 1), null);
});
test('matching uses live aliases, exact Naver company identity and bounded short aliases', () => {
  const companies = new Map([['달바글로벌', ['달바글로벌']], ['LS일렉트릭', ['LS ELECTRIC']], ['테스트', ['AI']]]);
  assert.equal(matchReport({ title: '달바글로벌(483650) 실적 개선' }, companies), '달바글로벌');
  assert.equal(matchReport({ itemName: 'LS ELECTRIC' }, companies, true), 'LS일렉트릭');
  assert.equal(matchReport({ title: 'RAIL 산업' }, companies), null);
  assert.equal(matchReport({ title: 'AI 산업' }, companies), '테스트');
});
test('same report on official list and Naver deduplicates despite author and company prefixes', async () => {
  const a = await reportSignature('달바글로벌', report('(연구원) 달바글로벌(483650): 실적 개선'));
  const b = await reportSignature('달바글로벌', report('실적 개선'));
  assert.equal(a, b);
  assert.notEqual(a, await reportSignature('달바글로벌', report('실적 개선', 'KB증권')));
});
test('official HTML collectors preserve dates and HTTPS report links', () => {
  assert.deepEqual(parseTable('samsung', '<tr><td>2026.10.30</td><a title="달바글로벌 실적 PDF 원문보기" href="/common.do?fileName=a.pdf&amp;x=1">PDF</a></tr>', 'https://www.samsungpop.com/a', '삼성증권'),
    [{ title: '달바글로벌 실적', broker: '삼성증권', date: '2026-10-30', url: 'https://www.samsungpop.com/common.do?fileName=a.pdf&x=1' }]);
  const mirae = `<tr><td>2026-10-30</td><a id="bbsTitle1">달바글로벌 실적</a><a href="javascript:downConfirm('https://securities.miraeasset.com/r.pdf')">PDF</a></tr>`;
  assert.equal(parseTable('mirae', mirae, 'https://securities.miraeasset.com', '미래에셋증권')[0].title, '달바글로벌 실적');
  assert.equal(parseHana('<a id="1" class="more_btn title">달바글로벌 실적</a><p>2026.10.30</p><a href="/download.cmd?a=1">PDF</a>')[0].broker, '하나증권');
  assert.equal(parseKorea(`<a onclick="goDetail('/r.pdf')"><span class="body_tit">달바글로벌</span><span class="tit_info">2026.10.30</span>`)[0].broker, '한국투자증권');
  assert.equal(parseNh('<a href="/research/authCheck?type=view&amp;rshPprNo=1"><p class="tit">달바글로벌</p>2026.10.30</a>')[0].broker, 'NH투자증권');
  assert.equal(parseNh('<a href="/research/authCheck?type=view&rshPprNo=1"><p class="tit">AI Brief 달바글로벌</p>2026.10.30</a>').length, 0);
  assert.equal(parseKb({ response: { reportList: [{ stkCd: '1', docTitle: '달바글로벌', publicDate: '2026-10-30', urlLink: 'https://rc.kbsec.com/report' }] } })[0].broker, 'KB증권');
});
test('Naver detail verifies company and only accepts trusted PDF attachment URLs', async () => {
  const item = { id: '1', itemCode: '483650', title: '실적', url: 'https://stock.naver.com/research/company/1' };
  await assert.rejects(reportDetail(item, async () => ({ itemCode: '000000' })), /mismatch/);
  const other = await reportDetail(item, async () => ({ itemCode: '483650', attachUrl: 'https://evil.example/r.pdf' }));
  assert.equal(other.url, item.url);
  const pdf = await reportDetail(item, async () => ({ itemCode: '483650', attachUrl: 'https://stock.pstatic.net/r.pdf', goalPrice: '50000', opinionText: '매수' }));
  assert.equal(pdf.goalPrice, '50,000'); assert.equal(pdf.url, 'https://stock.pstatic.net/r.pdf');
});
test('per-source baseline suppresses old reports, then new matching report is delivered once', async t => {
  const f = fixture(t); let rows = [report('달바글로벌 기존 실적')];
  const options = { request: f.request, collector: async () => rows };
  await runReportCheck(f.env, morning + 60000, options); // samsung at minute 1
  assert.equal(f.sent.length, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM report_items').get().n, 1);
  rows = [...rows, report('달바글로벌 새로운 실적', '삼성증권', '2')];
  await runReportCheck(f.env, later + 60000, options);
  assert.equal(f.sent.length, 1); assert.match(f.sent[0].text, /새로운 실적/);
  await runReportCheck(f.env, later + 60000, options);
  assert.equal(f.sent.length, 1);
});
test('failed source stays uninitialized; next source works and retry is rate limited', async t => {
  const f = fixture(t); const calls = [];
  const options = { request: f.request, collector: async source => { calls.push(source); if (source === 'naver') throw Error('503 unavailable'); return [report('달바글로벌 기존 리포트')]; } };
  await runReportCheck(f.env, morning, options);
  assert.equal(f.sql.prepare('SELECT initialized_ms FROM report_sources WHERE source = ?').get('naver').initialized_ms, null);
  await runReportCheck(f.env, morning + 60000, options);
  assert.deepEqual(calls, ['naver', 'samsung']);
  assert.ok(f.sql.prepare('SELECT initialized_ms FROM report_sources WHERE source = ?').get('samsung').initialized_ms);
});
test('pending Telegram delivery retries; disabled company and pause suppress report sending', async t => {
  const f = fixture(t);
  f.sql.prepare('INSERT INTO report_alerts (signature,ticker,body,url,created_ms) VALUES (?,?,?,?,?)').run('one', '달바글로벌', '리포트 테스트', 'https://example.com/r', 1);
  f.failSend(true); await assert.rejects(sendReportAlerts(f.env));
  assert.equal(f.sql.prepare('SELECT sent_ms FROM report_alerts').get().sent_ms, null);
  f.failSend(false); f.sql.exec('UPDATE bot_runtime SET paused = 1');
  assert.equal(await sendReportAlerts(f.env), 0);
  f.sql.exec('UPDATE bot_runtime SET paused = 0');
  f.sql.prepare('INSERT INTO watchlist_overrides VALUES (?, ?, 0)').run('달바글로벌', '["달바글로벌"]');
  assert.equal(await sendReportAlerts(f.env), 0);
  assert.equal(f.sent.length, 0);
  assert.ok(f.sql.prepare('SELECT sent_ms FROM report_alerts').get().sent_ms);
});
test('fetch budget counts redirects and refuses off-host targets', async t => {
  const original = globalThis.fetch; let count = 0;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => { count++; return new Response('', { status: 302, headers: { location: 'https://attacker.example/' } }); };
  await assert.rejects(requestBudget(2)('https://stock.naver.com/report'), /Unexpected/);
  assert.equal(count, 1);
  globalThis.fetch = async () => Response.json({ items: [] });
  const request = requestBudget(1); await request('https://stock.naver.com/report', { json: true });
  await assert.rejects(request('https://stock.naver.com/report'), /budget/);
});
