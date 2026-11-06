import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {parseKind,collectKind,runKindCheck,kindMessage,KIND_CRON,DART_PRIORITY_WAIT_MS} from '../src/kind.js';
import {handleCommand} from '../src/commands.js';
const NOW=Date.parse('2026-11-02T01:00:00Z');
const sourceTime = i => (Math.floor(NOW/300000)*5+i)*60000;
const html=name=>readFileSync(new URL('./fixtures/'+name+'.html',import.meta.url),'utf8');
const item=(id,status='청구서접수')=>({id,company:'미등록신규기업',status,filed:'2026-11-02',eventDate:'2026-11-02',market:'코스닥',listing:'신규상장',url:'https://kind.krx.co.kr/'});
const disclosure=id=>({id,company:'효성중공업',title:'공급계약',eventDate:'2026-11-02',url:'https://kind.krx.co.kr/'});
function fixture(t){
 const sql=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../migrations/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sql.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
 const DB={prepare(q){const stmt=(v=[])=>({bind:(...x)=>stmt(x),first:async()=>sql.prepare(q).get(...v)||null,all:async()=>({results:sql.prepare(q).all(...v)}),run:async()=>sql.prepare(q).run(...v)});return stmt();},async batch(ss){sql.exec('BEGIN');try{const r=[];for(const s of ss)r.push(await s.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const original=globalThis.fetch,replies=[];let fail=false;
 globalThis.fetch=async(url,options)=>{assert.match(url,/^https:\/\/api.telegram.org\//);if(fail)return new Response('',{status:500});replies.push(JSON.parse(options.body));return Response.json({ok:true,result:{}});};
 t.after(()=>{globalThis.fetch=original;sql.close();});
 return{sql,replies,fail:v=>{fail=v;},env:{DB,TELEGRAM_BOT_TOKEN:'test',TELEGRAM_CHAT_ID:'111'}};
}
const run=(f,slot,items,extra={})=>runKindCheck(f.env,sourceTime(slot),{now:NOW,collector:async()=>items,...extra});
test('actual KIND table fixtures parse receipt, approval and company disclosures',()=>{
 const r=parseKind(html('kind-received'),'ipo');assert.equal(r.rows.length,2);assert.equal(r.rows[0].status,'청구서접수');
 const a=parseKind(html('kind-approved'),'ipo');assert.equal(a.rows[0].status,'심사승인');
 const d=parseKind(html('kind-disclosure'),'disclosure','2026-10-30');assert.equal(d.rows[0].company,'TS트릴리온');assert.match(d.rows[0].title,/공매도/);assert.equal(d.rows[0].id,'20261030001461');
 assert.throws(()=>parseKind('<html>blocked</html>','ipo'));
 assert.throws(()=>parseKind(html('kind-received').replaceAll('fnDetailView','unknown'),'ipo'));
 assert.equal(parseKind('<table><tr><td colspan="5">조회된 결과값이 없습니다.</td></tr></table>전체 <em>0</em>건 : <strong>1</strong>/1','ipo').rows.length,0);
});
test('requests use full POST form, fail on redirects, and verify status filter',async()=>{
 await collectKind('today',NOW,async(url,o)=>{const p=new URLSearchParams(o.body);assert.equal(o.method,'POST');assert.equal(o.redirect,'manual');assert.equal(p.get('chose'),'');assert.equal(p.get('searchCorpName'),'');assert.equal(p.get('selDate'),'2026-11-02');return new Response(html('kind-disclosure'));});
 await assert.rejects(collectKind('today',NOW,async()=>new Response(null,{status:302})),/302/);
 await assert.rejects(collectKind('ipo:04',NOW,async()=>new Response(html('kind-approved'))),/필터/);
 const rows=await collectKind('ipo:01',Date.parse('2026-10-30T01:00Z'),async(url,o)=>{const p=new URLSearchParams(o.body);assert.equal(p.get('invstgRsltArrStr'),'01|');assert.equal(p.get('orderMode'),'2');return new Response(html('kind-received'));});assert.equal(rows.length,2);
});
test('pagination overflow fails closed, not a successful partial snapshot',async()=>{
 let calls=0;await assert.rejects(collectKind('today',NOW,async()=>{calls++;return new Response(html('kind-disclosure').replace('/1','/11'));}),/10페이지/);assert.equal(calls,10);
});
for(const [slot,status] of [[2,'청구서접수'],[3,'심사승인'],[4,'심사철회']])test(status+' baselines silently then sends once for companies outside watchlist',async t=>{
 const f=fixture(t);assert.equal((await run(f,slot,[item('old',status)])).sent,0);
 assert.equal((await run(f,slot,[item('old',status),item('new',status)])).sent,1);
 assert.equal((await run(f,slot,[item('old',status),item('new',status)])).sent,0);
 assert.match(f.replies[0].text,new RegExp(status));assert.match(f.replies[0].text,/미등록신규기업/);
});
test('failed initial collection remains uninitialized and recovery is silent',async t=>{
 const f=fixture(t);await assert.rejects(run(f,2,[],{collector:async()=>{throw Error('KIND HTTP 503');}}));
 assert.equal(f.sql.prepare('SELECT initialized_ms FROM kind_sources').get().initialized_ms,null);
 assert.equal((await run(f,2,[item('old')])).sent,0);
 assert.equal((await run(f,2,[item('new')])).sent,1);
});
test('watchlist-only disclosures deduplicate across today/yesterday; remove cancels pending',async t=>{
 const f=fixture(t);await run(f,0,[disclosure('old')]);await run(f,1,[disclosure('old')]);
 const other={...disclosure('other'),company:'미등록기업'};
 assert.equal((await run(f,0,[disclosure('new'),other])).sent,1);
 assert.equal((await run(f,1,[disclosure('new')])).sent,0);
 f.sql.exec('UPDATE bot_runtime SET paused=1');await run(f,0,[disclosure('pending')]);
 await handleCommand(f.env,{from:{id:111},chat:{id:111,type:'private'}},{name:'remove',arg:'효성중공업'});
 assert.equal(f.sql.prepare("SELECT count(*) AS n FROM kind_topics WHERE ticker='효성중공업'").get().n,0);
 assert.equal(f.sql.prepare('SELECT count(*) AS n FROM kind_items WHERE sent_ms IS NULL').get().n,0);
 await handleCommand(f.env,{from:{id:111},chat:{id:111,type:'private'}},{name:'add',arg:'효성중공업'});
 f.sql.exec('UPDATE bot_runtime SET paused=0');assert.equal((await run(f,0,[disclosure('added-baseline')])).sent,0);
});
test('pause queues, failed delivery remains retryable, lock prevents overlap',async t=>{
 const f=fixture(t);await run(f,2,[]);f.sql.exec('UPDATE bot_runtime SET paused=1');assert.equal((await run(f,2,[item('new')])).sent,0);
 f.sql.exec('UPDATE bot_runtime SET paused=0');f.fail(true);await assert.rejects(run(f,2,[]));
 assert.equal(f.sql.prepare('SELECT sent_ms FROM kind_items').get().sent_ms,null);
 f.fail(false);assert.equal((await run(f,2,[])).sent,1);
 f.sql.prepare('UPDATE kind_runtime SET lock_until_ms=?').run(NOW+1000);assert.deepEqual(await run(f,2,[]),{skipped:true});
});
test('status surfaces source failures even after another source succeeds',async t=>{
 const f=fixture(t);await assert.rejects(run(f,2,[],{collector:async()=>{throw Error('KIND HTTP 503');}}));await run(f,3,[]);
 await handleCommand(f.env,{from:{id:111},chat:{id:111,type:'private'}},{name:'status',arg:''});assert.match(f.replies.at(-1).text,/KIND 오류: ipo:01 · KIND HTTP 503/);
});



test('KIND does not repeat DART earnings even with another receipt; unrelated filings still send',async t=>{
 const f=fixture(t),report='연결재무제표기준영업(잠정)실적(공정공시)';
 await run(f,0,[]); // KIND today baseline.
 f.sql.prepare('INSERT INTO dart_filings(receipt_no,ticker,company_name,report_name,filed_date,discovered_ms,sent_ms) VALUES(?,?,?,?,?,?,?)')
   .run('20261102000021','효성중공업','효성중공업',report,'20261102',NOW,NOW);
 const kind={...disclosure('20261102000022'),title:report};
 const result=await run(f,0,[kind]);
 assert.equal(result.sent,0,'KIND must skip DART-delivered earnings across different receipt ids');
 assert.equal(f.replies.length,0);
 assert.ok(f.sql.prepare('SELECT sent_ms FROM kind_items WHERE event_key=?').get('disclosure:'+kind.id).sent_ms);
 assert.equal((await run(f,0,[{...disclosure('20261102000023'),title:'신규 공급 계약 체결'}])).sent,0,
  'DART is preferred for ordinary matching disclosures too');
 assert.equal((await runKindCheck(f.env,sourceTime(0),{
  now:NOW+DART_PRIORITY_WAIT_MS+1000,
  collector:async()=>[{...disclosure('20261102000023'),title:'신규 공급 계약 체결'}]
 })).sent,1,'a genuinely KIND-only contract arrives after DART wait');
 assert.match(f.replies[0].text,/신규 공급 계약/);
});

test('KIND-only preliminary earnings waits the full DART priority window before fallback',async t=>{
 const f=fixture(t),report='연결재무제표기준영업(잠정)실적(공정공시)';
 await run(f,0,[]);
 const kind={...disclosure('20261102000030'),title:report};
 assert.equal((await run(f,0,[kind])).sent,0,'KIND first waits for DART');
 assert.equal((await runKindCheck(f.env,sourceTime(0),{now:NOW+120000,collector:async()=>[kind]})).sent,0);
 assert.equal((await runKindCheck(f.env,sourceTime(0),{now:NOW+DART_PRIORITY_WAIT_MS-1,collector:async()=>[kind]})).sent,0);
 assert.equal(f.replies.length,0);
 const later=await runKindCheck(f.env,sourceTime(0),{now:NOW+DART_PRIORITY_WAIT_MS+1000,collector:async()=>[kind]});
 assert.equal(later.sent,1,'truly KIND-only filings still arrive after DART grace');
 assert.equal(f.replies.length,1);
 assert.match(f.replies[0].text,/KIND 공시/);
 assert.equal((await runKindCheck(f.env,sourceTime(0),{now:NOW+DART_PRIORITY_WAIT_MS+60000,collector:async()=>[kind]})).sent,0);
 const claim=f.sql.prepare('SELECT * FROM disclosure_deliveries').get();
 assert.equal(claim.source,'kind');
 assert.ok(claim.delivered_ms>0);
});
