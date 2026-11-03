import test from 'node:test';
import assert from 'node:assert/strict';
import {sameNews,coveredNewsEvent} from '../src/news-dedup.js';
const a={ticker:'크래프톤',title:'크래프톤, 자사주 3000억원 매입 소각',description:'크래프톤은 자사주 165만주를 매입 소각키로 했다고 3일 공시했다. 전체 발행 주식의 3.63% 규모로 시가 3000억원 상당이다.',pub_ms:Date.parse('2026-11-03T16:38:00+09:00')};
const b={...a,title:'크래프톤, 3000억 자사주 사들여 소각…올해 주주환원 9172억',description:'크래프톤이 3000억원 규모의 자사주를 사들여 모두 소각한다. 크래프톤은 3일 이사회를 열고 3000억원 규모의 자기주식 취득을 결정했다고 공시했다.'};
test('screenshot: acquisition amount matches despite annual return total and rewrite',()=>{
 assert.equal(sameNews(a,b),true);assert.equal(sameNews(b,a),true);
 assert.ok(coveredNewsEvent(a));assert.equal(coveredNewsEvent(a),coveredNewsEvent(b));
});
test('all companies share buyback comparison with trillion and comma normalization',()=>{
 assert.equal(sameNews({...a,ticker:'다른회사'},{...b,ticker:'다른회사',title:'다른회사 자사주 0.3조원 매입 결정'}),true);
 assert.equal(sameNews(a,{...b,title:'크래프톤 자기주식 3,000억원 취득 결정'}),true);
});
test('different amounts, companies, dates and real follow-ups remain distinct',()=>{
 for(const title of ['크래프톤 자사주 4000억원 매입 소각','크래프톤 자사주 3000억원 추가 매입','크래프톤 자사주 3000억원 매입 취소','크래프톤 자사주 3000억원 매입 완료','크래프톤 자사주 3000억원 신탁 취득']){
  const item={...b,title};assert.equal(sameNews(a,item),false,title);assert.equal(coveredNewsEvent(item),null,title);
 }
 assert.equal(sameNews(a,{...b,ticker:'다른회사'}),false);
 assert.equal(sameNews(a,{...b,pub_ms:a.pub_ms+7*86400000}),false);
 assert.equal(coveredNewsEvent({...b,pub_ms:a.pub_ms+7*86400000}),null);
});
