import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeFiling} from '../src/dart-summary.js';
test('contract termination selects facts from vertical cells without background paragraphs',()=>{
 const body='단일판매ㆍ공급계약 해지\n- 해지계약명\n동남아 수출 공급 계약\n해지금액(원)\n69,227,120,771\n최근매출액(원)\n839,686,478,174\n매출액대비(%)\n8.24\n3. 계약상대\nABBOTT PRODUCTS OPERATIONS AG (Switzerland)\n5. 해지 주요사유\n사업 환경 변화에 따라 양사 합의로 계약해지\n6. 해지일자\n2024-02-28\n8. 기타 투자판단과 관련한 중요사항\n기타 설명'.repeat(1);
 const s=summarizeFiling('단일판매ㆍ공급계약해지',body);
 for(const v of ['동남아','69,227,120,771','8.24','ABBOTT','양사 합의','2024-02-28'])assert.ok(s.includes(v),v);
 assert.doesNotMatch(s,/839,686|기타 설명/);assert.ok(s.length<800);
});
test('table rows keep units; unknown financial tables and amendments retain context as excerpts',()=>{
 assert.match(summarizeFiling('현금배당결정','주당배당금(원) | 500\n배당기준일 | 2026-12-31'),/주당배당금\(원\): 500/);
 assert.match(summarizeFiling('실적공시','단위: 백만원\n구분 | 당기 | 전기\n매출액 | 500 | 400\n영업이익 | 50 | 30'),/단위: 백만원\n구분 \| 당기 \| 전기/);
 assert.match(summarizeFiling('[기재정정] 계약','정정사항\n정정항목 | 정정 전 | 정정 후\n계약금액 | 500 | 600'),/정정 전 \| 정정 후/);
 assert.ok(summarizeFiling('기타',('설명'.repeat(2000))).length<1000);
 assert.doesNotMatch(summarizeFiling('계약','계약상대\n계약금액(원)\n100'),/계약상대: 계약금액/);
});
