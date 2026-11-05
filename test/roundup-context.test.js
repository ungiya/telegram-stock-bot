import test from 'node:test';
import assert from 'node:assert/strict';
import {enrichNewsEvent,roundupNeedsContext} from '../src/news-event-context.js';
import {sameNews} from '../src/news-dedup.js';
const item={ticker:'LS일렉트릭',pub_ms:Date.parse('2026-11-05T12:45:00+09:00'),url:'https://www.lcnews.co.kr/news/articleView.html?idxno=210880',title:'[산업 Pick] LS일렉트릭·현대제철, 첨단 예방진단 기술 확보와 헤리티지...',description:'LS일렉트릭·현대제철이 전력망의 무중단 신뢰성을 담보하는 공공 첨단 기술의 민간 이전부터 반세기가 넘는 제조업의 역사와 조직 문화를 디지털 자산으로 집대성하는 아카이빙에...'};
const previous={...item,title:'LS일렉트릭, 한전 고장예측 기술 도입…전력설비 관리사업 강화',description:'LS일렉트릭이 한국전력의 전력설비 예방진단 기술을 도입해 설비관리 솔루션을 고도화한다.'};
const html='<div id="article-view-content-div">종합 서문 ◆ LS일렉트릭, 한국전력 전력설비 예방진단 솔루션(SEDA) 기술 도입 LS일렉트릭이 한국전력의 전력설비 예방진단 핵심 기술을 도입했다. 지난 4일 한전과 기술이전 계약을 체결했다. ◆ 현대제철, 참여형 디지털 아카이브 개설 현대제철은 H.ARCHIVE를 개설했다.</div>';
const request=async()=>new Response(html,{headers:{'content-type':'text/html'}});
test('reported mixed roundup enriches target company before history comparison',async()=>{
 assert.equal(sameNews(item,previous),false);
 const result=await enrichNewsEvent(item,request);
 assert.equal(result.held,false);assert.equal(sameNews(result.item,previous),true);
 assert.equal(result.item.description.includes('현대제철'),false);
 assert.equal(item.title.includes('현대제철'),true);
});
test('roundup enrichment applies to arbitrary companies and holds unavailable sections',async()=>{
 const x={...item,ticker:'미래기업',title:'[기업 소식] 미래기업·다른기업 소식'};
 const r=await enrichNewsEvent(x,async()=>new Response(html.replaceAll('LS일렉트릭','미래기업'),{headers:{'content-type':'text/html'}}));
 assert.equal(r.held,false);assert.equal(r.item.description.includes('현대제철'),false);
 assert.equal((await enrichNewsEvent(x,request)).held,true);
 assert.equal((await enrichNewsEvent(x,async()=>{throw Error('offline')})).held,true);
 assert.equal(roundupNeedsContext({...item,title:'LS일렉트릭·현대제철 소식'}),true);
 assert.equal(roundupNeedsContext({...item,title:'LS일렉트릭, 전력사업 강화'}),false);
});
