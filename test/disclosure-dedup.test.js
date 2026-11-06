import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {earningsDisclosureKey,ownershipDisclosureKey,sharedDisclosureKey,claimDisclosure,finishDisclosure,releaseDisclosure} from '../src/disclosure-dedup.js';

const date='2026-11-06';
const filing=(ticker,title,d=date)=>({ticker,title,date:d});
const connected='연결재무제표기준영업(잠정)실적(공정공시)';
const connectedVariant='연결재무제표기준 영업 (잠정) 실적 (공정 공시)';
const separate='영업(잠정)실적(공정공시)';
function fixture(t) {
 const sql=new DatabaseSync(':memory:');
 sql.exec(readFileSync(new URL('../migrations/0012_cross_source_disclosures.sql',import.meta.url),'utf8'));
 const DB={prepare(q){const stmt=(v=[])=>({bind:(...x)=>stmt(x),first:async()=>sql.prepare(q).get(...v)||null,all:async()=>({results:sql.prepare(q).all(...v)}),run:async()=>sql.prepare(q).run(...v)});return stmt();}};
 t.after(()=>sql.close());
 return {sql,env:{DB}};
}

test('KIND and DART earnings with different receipts share a key; separate/period/amended do not',()=>{
 const a=earningsDisclosureKey(filing('씨어스',connected));
 const b=earningsDisclosureKey(filing('씨어스',connectedVariant,'20261106'));
 assert.ok(a);
 assert.equal(a,b);
 assert.notEqual(a,earningsDisclosureKey(filing('씨어스',separate)));
 assert.notEqual(a,earningsDisclosureKey(filing('씨어스',connected,'2026-11-07')));
 assert.notEqual(a,earningsDisclosureKey(filing('에이피알',connected)));
 assert.equal(earningsDisclosureKey(filing('씨어스','[기재정정] '+connected)),null);
 assert.equal(earningsDisclosureKey(filing('씨어스','[정정] '+connected)),null);
 assert.equal(earningsDisclosureKey(filing('씨어스','분기보고서 (2026.09)')),null);
 assert.equal(earningsDisclosureKey(filing('씨어스','매출액또는손익구조30%(대규모법인15%)이상변경')),null);
 assert.equal(earningsDisclosureKey(filing('씨어스','연결재무제표기준영업(잠정)실적(공정공시)','garbage')),null);
});

test('atomic KIND/DART claim prevents simultaneous sends and remains durable across restarts',async t=>{
 const f=fixture(t),key=earningsDisclosureKey(filing('씨어스',connected));
 const now=Date.parse('2026-11-06T12:00:00+09:00');
 const [a,b]=await Promise.all([
   claimDisclosure(f.env,key,'kind','20261106000001',now),
   claimDisclosure(f.env,key,'dart','20261106000002',now)
 ]);
 assert.deepEqual([a.status,b.status].sort(),['busy','claimed']);
 const winner=a.status==='claimed'?a:b;
 await finishDisclosure(f.env,winner,now);
 const later=await claimDisclosure(f.env,key,'dart','20261106000003',now+60000);
 assert.equal(later.status,'duplicate');
 const row=f.sql.prepare('SELECT * FROM disclosure_deliveries WHERE event_key=?').get(key);
 assert.equal(row.delivered_ms,now);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM disclosure_deliveries').get().n,1);
});

test('failed send releases its shared claim and next source can retry immediately',async t=>{
 const f=fixture(t),key=earningsDisclosureKey(filing('씨어스',connected));
 const now=Date.now();
 const a=await claimDisclosure(f.env,key,'kind','A',now);
 assert.equal(a.status,'claimed');
 await releaseDisclosure(f.env,a);
 assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM disclosure_deliveries').get().n,0);
 const b=await claimDisclosure(f.env,key,'dart','B',now+1000);
 assert.equal(b.status,'claimed');
 await finishDisclosure(f.env,b,now+1000);
 assert.equal((await claimDisclosure(f.env,key,'kind','A',now+2000)).status,'duplicate');
});

test('abandoned claim can be recovered after TTL, never overwrite a completed delivery',async t=>{
 const f=fixture(t),key=earningsDisclosureKey(filing('씨어스',connected));
 const now=Date.now();
 const a=await claimDisclosure(f.env,key,'kind','A',now);
 assert.equal(a.status,'claimed');
 const early=await claimDisclosure(f.env,key,'dart','B',now+2*60000);
 assert.equal(early.status,'busy');
 const b=await claimDisclosure(f.env,key,'dart','B',now+4*60000);
 assert.equal(b.status,'claimed');
 await releaseDisclosure(f.env,a); // Stale owner may not erase B.
 assert.equal(f.sql.prepare('SELECT receipt FROM disclosure_deliveries WHERE event_key=?').get(key).receipt,'B');
 await finishDisclosure(f.env,b,now+4*60000);
 assert.equal((await claimDisclosure(f.env,key,'kind','A',now+8*60000)).status,'duplicate');
});



test('missing migration does not stop legacy DART/KIND delivery while rollout completes',async t=>{
 const sql=new DatabaseSync(':memory:');
 t.after(()=>sql.close());
 const env={DB:{prepare(q){const stmt=(v=[])=>({bind:(...x)=>stmt(x),first:async()=>sql.prepare(q).get(...v)||null});return stmt();}}};
 const key=earningsDisclosureKey(filing('씨어스',connected));
 const result=await claimDisclosure(env,key,'dart','test',Date.now());
 assert.equal(result.status,'not_applicable');
 assert.equal(result.reason,'migration_pending');
 await finishDisclosure(env,result,Date.now());
 await releaseDisclosure(env,result);
});



test('Nov 6 two companies share the title but not the event; KIND/DART form variants match',()=>{
 const title='주식등의대량보유상황보고서(약식)';
 const seojin=sharedDisclosureKey({ticker:'서진시스템',title,date:'2026-11-06'});
 const hanjung=sharedDisclosureKey({ticker:'한중엔시에스',title,date:'2026-11-06'});
 assert.ok(seojin?.startsWith('ownership-5pct:'));
 assert.ok(hanjung?.startsWith('ownership-5pct:'));
 assert.notEqual(seojin,hanjung,'one company must not suppress a different company');
 assert.equal(seojin,sharedDisclosureKey({ticker:'서진시스템',
   report_name:'주식 등의 대량 보유 상황 보고서 (약식)',filed_date:'20261106'}));
 assert.equal(seojin,ownershipDisclosureKey({ticker:'서진시스템',
   title:'주식등의대량보유상황보고서(약식)',date:'20261106'}));
 assert.notEqual(seojin,sharedDisclosureKey({ticker:'서진시스템',title,
   date:'2026-11-07'}),'different day must stay separate');
 assert.notEqual(seojin,sharedDisclosureKey({ticker:'서진시스템',
   title:'주식등의대량보유상황보고서',date:'2026-11-06'}),'short and general are different forms');
 for(const amended of ['[기재정정]'+title,'[정정] '+title,'[첨부정정]'+title])
   assert.equal(sharedDisclosureKey({ticker:'서진시스템',title:amended,date:'2026-11-06'}),null);
 assert.equal(sharedDisclosureKey({ticker:'서진시스템',
   title:'주요주주특정증권등소유상황보고서',date:'2026-11-06'}),null);
});

test('atomic cross-source large-shareholding notice sends once, same-source distinct receipts stay eligible',async t=>{
 const f=fixture(t), now=Date.parse('2026-11-06T16:25:00+09:00');
 const key=sharedDisclosureKey({ticker:'서진시스템',
   title:'주식등의대량보유상황보고서(약식)',date:'2026-11-06'});
 const dart=await claimDisclosure(f.env,key,'dart','20261106000359',now);
 assert.equal(dart.status,'claimed');
 assert.equal((await claimDisclosure(f.env,key,'kind','20261106000804',now+1000)).status,'busy');
 await finishDisclosure(f.env,dart,now+2000);
 assert.equal((await claimDisclosure(f.env,key,'kind','20261106000804',now+3000)).status,'duplicate');
 const second=await claimDisclosure(f.env,key,'dart','20261106000367',now+4000);
 assert.equal(second.status,'not_applicable','a distinct DART filing must remain alertable');
 assert.equal(second.reason,'same_source_distinct_receipt');
 const corrected=sharedDisclosureKey({ticker:'서진시스템',
   title:'[기재정정] 주식등의대량보유상황보고서(약식)',date:'2026-11-06'});
 assert.equal(corrected,null);
 const another=sharedDisclosureKey({ticker:'한중엔시에스',
   title:'주식등의대량보유상황보고서(약식)',date:'2026-11-06'});
 assert.equal((await claimDisclosure(f.env,another,'dart','20261106000366',now+5000)).status,'claimed');
});

test('ownership cross-source first sent via KIND stops DART; old earnings key still works',async t=>{
 const f=fixture(t),now=Date.parse('2026-11-06T16:25:00+09:00');
 const key=sharedDisclosureKey({ticker:'한중엔시에스',
   title:'주식등의대량보유상황보고서(약식)',date:'20261106'});
 const a=await claimDisclosure(f.env,key,'kind','20261106000809',now);
 await finishDisclosure(f.env,a,now);
 assert.equal((await claimDisclosure(f.env,key,'dart','20261106000366',now+10000)).status,'duplicate');
 assert.equal(sharedDisclosureKey(filing('씨어스',connected)),earningsDisclosureKey(filing('씨어스',connected)));
});
