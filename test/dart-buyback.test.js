import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeFiling} from '../src/dart-summary.js';
import {viewerUrl} from '../src/dart-body.js';
const body=readFileSync(new URL('./fixtures/krafton-buyback.txt',import.meta.url),'utf8');
test('actual Krafton filing separates planned purchase from old holdings and daily limits',()=>{
 const s=summarizeFiling('주요사항보고서(자기주식취득결정)',body);
 assert.match(s,/1,651,073주 \(약 3,000억원\)/);
 for(const x of ['자기주식 취득 및 소각을 통한 주주가치 제고','유가증권시장에서의 직접 취득','미래에셋증권','2026.11.03','2026.11.04 ~ 2027.02.03'])assert.ok(s.includes(x),x);
 assert.doesNotMatch(s,/672,276|165,107|시총대비|8조|3.63%/);assert.ok(s.length<1000);
 assert.match(s,/기타주식\n취득수량: -/);
});
test('DART viewer permits observed dart4.xsd while pinning receipt and official host',()=>{
 const u=viewerUrl('viewDoc("20261103000268", "11639590", "0", "0", "0", "dart4.xsd", "")','20261103000268');
 assert.equal(u.searchParams.get('dtd'),'dart4.xsd');assert.equal(u.hostname,'dart.fss.or.kr');
});
