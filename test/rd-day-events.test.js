import test from 'node:test';
import assert from 'node:assert/strict';
import {sameNews,coveredNewsEvent} from '../src/news-dedup.js';
import {reportedDndRdDay} from '../src/rd-day-events.js';
import {queuedNewsExcluded,normalizeArticle} from '../src/worker.js';
const pub_ms=Date.parse('2026-11-03T16:45:00+09:00');
const cases=[
 ['[현장+] 이슬기 디앤디파마텍 대표 "향후 10년, 임상 결과로 입증할 것"','발표 중인 이슬기 디앤디파마텍 대표. 지난 10년이 기술을 축적하고 글로벌 신약 개발 역량을 만들어온 시간이었다면...', 'https://www.greened.kr/news/articleView.html?idxno=353750'],
 ["[현장+] 디앤디파마텍, 근육 보존 비만약 'DD18' 승부수…내년 LO 추진",'디앤디파마텍은 DD18을 통해 이러한 문제를 보완할 예정입니다. 곽정선 사업개발팀장은 3일 서울 강남구 삼성동...', 'https://www.greened.kr/news/articleView.html?idxno=353736'],
 ['디앤디파마텍 “지방간서 간경변까지…간 질환 신약 개발 확장”',"디앤디파마텍이 지방간에서 간경변까지 아우르는 간 질환 신약 포트폴리오 구축을 추진한다. DD01의 임상 성과를 바탕으로 연내 글로벌 기술수출에 속도를...",'https://www.sedaily.com/article/20109691?ref=naver'],
 ['디앤디파마텍, JP모건과 DD01 연내 기술이전 추진…복수 빅파마와 협상','글로벌 투자은행 JP모건을 자문사로 선정하고 DD01의 연내 기술이전을 추진한다.', 'https://www.newsway.co.kr/news/view?ud=2026110314075446987'],
 ['디앤디파마텍, 비만약 다음 카드 꺼냈다…파킨슨·방사성의약품 동시 공략','디앤디파마텍 R&amp;D Day 2026에서 발표한 신약 개발 전략.', 'https://www.yakup.com/news/index.html?mode=view&cat=12&nid=334699']
].map(([title,description,url])=>({title,description,url,ticker:'디앤디파마텍',pub_ms}));
test('all five screenshot articles blocked both in new search and existing send queue',()=>{
 for(const x of cases){
  assert.ok(coveredNewsEvent(x),x.title);assert.equal(queuedNewsExcluded(x),true);
  assert.equal(normalizeArticle({title:x.title,description:x.description,originallink:x.url,link:x.url,pubDate:new Date(pub_ms).toUTCString()},x.ticker,pub_ms+60000),null);
  assert.equal(reportedDndRdDay({...x,url:'https://other.example/rewrite'}),true,x.title);
 }
});
test('all companies R&D day coverage grouped despite entirely different pipeline headlines',()=>{
 const a={...cases[0],ticker:'다른회사',description:'3일 R&D Day 2026에서 경영진이 발표했다.'};
 const b={...cases[4],ticker:'다른회사',description:'3일 R&D Day 2026에서 파킨슨 연구 전략을 소개했다.'};
 assert.equal(sameNews(a,b),true);
 assert.equal(sameNews(a,{...b,description:'11월 4일 R&D Day 2026 개최',pub_ms:pub_ms+86400000}),true);
 assert.equal(sameNews({...a,description:'11월 3일 R&D Day 2026 개최'},{...b,description:'11월 4일 R&D Day 2026 개최'}),false);
 assert.equal(sameNews(a,{...b,description:'R&D Day 2027 개최'}),false);
 assert.equal(sameNews(a,{...b,title:'DD01 기술이전 계약 체결'}),false);
});
test('preserve actual deals, clinical results, corrections and future events',()=>{
 for(const title of ['디앤디파마텍 DD01 기술이전 계약 체결','디앤디파마텍 임상 2상 결과 발표','디앤디파마텍 FDA 승인','디앤디파마텍 R&D Day 발표 정정']){
  assert.equal(reportedDndRdDay({...cases[4],url:'https://new.example/news',title}),false,title);
 }
 for(const x of cases)assert.equal(reportedDndRdDay({...x,url:'https://new.example/news',pub_ms:pub_ms+7*86400000}),false);
 assert.equal(reportedDndRdDay({...cases[4],url:'https://new.example/news',description:'2027 R&D Day',title:'디앤디파마텍 R&D Day 2027 전략 발표'}),false);
});
