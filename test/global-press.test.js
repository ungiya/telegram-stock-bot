import test from 'node:test';
import assert from 'node:assert/strict';
import { sameNews } from '../src/news-dedup.js';
import { newsAllowed, priceNewsExcluded } from '../src/filters.js';
import { queuedNewsExcluded } from '../src/worker.js';
// Synthetic regression examples, not claims about an actual Wadiz announcement.
const a={ticker:'와디즈',title:'와디즈, 메이커스 페스티벌 개최…성수동서 만난다',description:'와디즈는 성수동에서 메이커스 페스티벌을 개최한다고 밝혔다. 창작자와 소비자가 직접 만나 혁신 제품을 체험하고 제작 과정을 공유하는 행사다.',pub_ms:Date.UTC(2026,10,3)};
const b={...a,title:'창작자와 소비자 만남의 장…와디즈 체험 행사 열린다',description:'창작자와 소비자가 직접 만나 혁신 제품을 체험하고 제작 과정을 공유한다. 와디즈가 성수동에서 개최하는 메이커스 페스티벌 행사다.'};
test('all-company press matching recognizes rewritten Wadiz headlines and reordered leads',()=>{
 assert.equal(sameNews(a,b),true);
 assert.equal(sameNews(b,a),true);
 for(const ticker of ['새로운기업','에이피알']) assert.equal(sameNews({...a,ticker},{...b,ticker}),true);
});
test('distinct Wadiz announcements and material follow-ups survive',()=>{
 assert.equal(sameNews(a,{...b,title:'와디즈, 투자 유치 300억원 확정',description:'와디즈는 신규 투자자들로부터 300억원 투자를 유치하고 해외 사업을 확대한다.'}),false);
 assert.equal(sameNews(a,{...b,title:'와디즈 메이커스 페스티벌 취소'}),false);
 assert.equal(sameNews(a,{...b,title:'와디즈 메이커스 페스티벌 누적 방문객 10만명 돌파'}),false);
 assert.equal(sameNews(a,{...b,ticker:'다른회사'}),false);
});
test('price-led headlines stay blocked even with material background at collection and delivery',()=>{
 for(const title of ['에이피알 주가 5% 상승','[특징주] 에이피알 수주 소식에 급등','에이피알 3% 하락','에이피알 장중 강세']){
  assert.equal(priceNewsExcluded(title),true,title);
  assert.equal(newsAllowed('에이피알',['에이피알'],title,'영업이익 증가와 공급 계약이 배경이다.'),false,title);
  assert.equal(queuedNewsExcluded({ticker:'에이피알',title,description:'영업이익 증가',url:'https://example.com/a'}),true,title);
 }
 assert.equal(priceNewsExcluded('에이피알 분기 영업이익 30% 증가'),false);
 assert.equal(priceNewsExcluded('효성중공업 미국 변압기 공급 계약 체결'),false);
});
