import test from 'node:test';
import assert from 'node:assert/strict';
import {sameNews} from '../src/news-dedup.js';
import {commonEventRelation} from '../src/common-news-events.js';
const ts=Date.parse('2030-04-04T10:00:00+09:00');
const item=(title,description='')=>({ticker:'미래기업',title,description,pub_ms:ts});
const cases=[
 [item('미래기업 뷰티원 캐나다 최대 드럭스토어 입점','뷰티원이 캐나다 샤퍼스 1300개 전 매장에서 판매된다.'),item('미래기업 뷰티원, 캐나다 샤퍼스 1300개 매장 입점','뷰티원이 캐나다 최대 드럭스토어 체인에서 판매를 시작했다.')],
 [item('미래기업 리유즈, 2분기 거래액 83% 급증…최대','리유즈의 재구매 고객과 신규 고객이 증가했다.'),item('미래기업 리유즈 2분기 거래액 전 분기 대비 83% 증가','리유즈가 서비스 출시 후 최대 거래액을 기록했다.')],
 [item('미래기업 새빛, 유럽 500개 매장 입성','새빛이 유럽 헬스플러스 500개 매장에서 판매된다.'),item('미래기업 새빛 유럽 헬스플러스 입점','새빛은 유럽 500개 매장에 입점하며 판매 기반을 넓힌다.')]
];
test('future unnamed companies use common event facts, not fixed dates and company exceptions',()=>{
 for(const [a,b] of cases){assert.equal(commonEventRelation(a,b),true,a.title);assert.equal(sameNews(a,b),true);assert.equal(sameNews(b,a),true);}
});
test('actual followups, distinct periods, quantities, counterparties and companies survive',()=>{
 const [a,b]=cases[0];
 for(const x of [{...b,ticker:'별도기업'}, {...b,title:'미래기업 뷰티원 캐나다 입점 취소'}, {...b,title:'미래기업 뷰티원 캐나다 매출 500억원 돌파'}, {...b,pub_ms:ts+20*86400000}, {...b,title:'미래기업 뷰티원 캐나다 샤퍼스 1500개 매장 입점'}])assert.notEqual(commonEventRelation(a,x),true,x.title);
 const [c,d]=cases[1];assert.equal(commonEventRelation(c,{...d,title:d.title.replace('2분기','3분기')}),false);
 assert.notEqual(commonEventRelation(c,{...d,title:d.title.replace('리유즈','에코몰'),description:'에코몰 실적 발표'}),true);
});
test('different retail partners and growth bases do not collapse into the same announcement',()=>{
 const a=item('미래기업 뷰티원 캐나다 샤퍼스 1300개 매장 입점','캐나다 샤퍼스 1300개 매장에서 판매한다.');
 const b=item('미래기업 뷰티원 캐나다 뉴리테일 1300개 매장 입점','캐나다 뉴리테일 1300개 매장에서 판매한다.');
 assert.equal(commonEventRelation(a,b),false);
 const [c,d]=cases[1];
 assert.equal(commonEventRelation({...c,title:c.title+' 전년 대비'},{...d,title:d.title+' 전분기 대비'}),false);
});
