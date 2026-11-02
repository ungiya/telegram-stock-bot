import test from 'node:test';
import assert from 'node:assert/strict';
import {personnelRelation,reportedSkPersonnel} from '../src/personnel-events.js';
import {sameNews,coveredNewsEvent} from '../src/news-dedup.js';
const base={ticker:'sk이노베이션',pub_ms:Date.parse('2026-11-02T00:00Z'),description:''};
test('SK current round headlines are covered without blocking unrelated appointments',()=>{
 for(const title of ['SK이노베이션, 2027년 사장단 인사 단행…정승일 총괄사장 선임','SK이노베이션, 전력 사업 강화 사장단 인사...정승일 총괄사장 선임','SK이노베이션 정승일 총괄사장·강동수 사장 신규 선임','SK이노베이션 강동수 사장 선임'])
  assert.equal(coveredNewsEvent({...base,title}),'event:sk-innovation-2027-personnel-2026-10-30');
 assert.equal(reportedSkPersonnel({...base,title:'SK이노베이션 2027년 사장단 인사 단행',description:'정승일 총괄사장과 강동수 사장을 선임했다.'}),true);
 for(const title of ['SK이노베이션 정승일 총괄사장 사임','SK이노베이션 김철수 사장 선임','SK이노베이션 정승일 부회장 선임','SK이노베이션 2028년 정승일 총괄사장 선임','SK이노베이션 정승일 총괄사장 영입 후 실적 개선'])
  assert.equal(reportedSkPersonnel({...base,title}),false);
});
test('generic appointment comparison groups names and roles across outlets, keeps new people and cycles',()=>{
 const a={...base,ticker:'테스트기업',title:'테스트기업 김철수 대표이사 선임',description:'경영 효율화로 경쟁력 강화'};
 const b={...a,title:'미래 성장 이끌 새 수장…테스트기업 대표이사에 김철수 발탁',description:'사업 재편을 위한 외부 인재 영입'};
 assert.equal(personnelRelation(a,b),true);assert.equal(sameNews(a,b),true);
 assert.equal(personnelRelation(a,{...b,title:'테스트기업 박영수 대표이사 선임'}),false);
 assert.equal(personnelRelation(a,{...b,title:'테스트기업 김철수 부회장 선임'}),false);
 assert.equal(personnelRelation(a,{...b,pub_ms:a.pub_ms+40*86400000}),null);
 assert.equal(sameNews(a,{...b,title:'테스트기업 김철수 대표이사 선임 철회'}),false);
});
