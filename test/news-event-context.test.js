import test from 'node:test';
import assert from 'node:assert/strict';
import {articleContext,enrichNewsEvent} from '../src/news-event-context.js';
import {sameNews} from '../src/news-dedup.js';
import {formatTelegramMessage} from '../src/worker.js';
const item={ticker:'효성중공업',title:'효성중공업 "국내 최대 에너지 산업 전시회에서 차세대 전력망 솔루션 공개"',description:'효성중공업이 국내 최대 에너지 산업 전시회에서 차세대 전력망 솔루션을 공개한다. 전력망 솔루션은 발전소에서 생산된 전기를 송전·변전·배전, 최종 소비자에게 안전하고 효율적으로 공급한다.',pub_ms:Date.parse('2026-11-04T12:00:00+09:00'),url:'https://www.ngonews.kr/news/articleView.html?idxno=242322'};
const body='<div id="article-view-content-div"><div><figure><figcaption>효성중공업이 &#39;BIXPO(빛가람 국제전력기술 엑스포) 2026&#39;에 참가한다.</figcaption></figure></div><p>효성중공업이 차세대 전력망 솔루션을 전시한다.</p></div>';
const html='<html>'+body+'<aside>UnrelatedExpo 2030 참가</aside></html>';
const response=()=>new Response(html,{headers:{'content-type':'text/html;charset=utf-8'}});
test('actual missing-name excerpt acquires original exhibition identity and matches sent story',async()=>{
 const {item:compared,held}=await enrichNewsEvent(item,async()=>response());
 assert.equal(held,false);assert.match(compared.description,/BIXPO/);
 const earlier={...item,title:'효성중공업 BIXPO 2026 참가…HVDC 기술 선보여',description:'효성중공업이 BIXPO 2026 전시회에 참가했다.'};
 assert.equal(sameNews(earlier,compared),true);assert.equal(sameNews(compared,earlier),true);
 assert.doesNotMatch(item.description,/BIXPO/,'display excerpt remains unchanged');
 assert.doesNotMatch(formatTelegramMessage(item),/UnrelatedExpo/);
});
test('nested article body excludes sidebar event identities',()=>{
 const result=articleContext(html);assert.match(result,/BIXPO/);assert.doesNotMatch(result,/UnrelatedExpo/);
 assert.equal(articleContext('<aside>BIXPO 2026</aside>'),'');
 assert.equal(articleContext('<script type="application/ld+json">'+JSON.stringify({'@type':'NewsArticle',articleBody:'미래기업 FutureExpo 2030 참가'})+'</script>'),'미래기업 FutureExpo 2030 참가');
});
test('unreadable, absent or oversized article is held; known events and real contracts need no extra fetch',async()=>{
 for(const request of [async()=>{throw Error('network')},async()=>new Response('unavailable',{status:403}),async()=>new Response('<aside>BIXPO 2026</aside>',{headers:{'content-type':'text/html'}}),async()=>new Response('x'.repeat(513*1024),{headers:{'content-type':'text/html'}})])assert.equal((await enrichNewsEvent(item,request)).held,true);
 const never=async()=>{throw Error('unexpected request')};
 for(const x of [{...item,title:'효성중공업 BIXPO 2026 참가'},{...item,title:'효성중공업 공급 계약 체결'}])assert.deepEqual(await enrichNewsEvent(x,never),{item:x,held:false});
});
test('future companies recover their own named expo without fixed-date exceptions',async()=>{
 const future={...item,ticker:'미래기업',title:'미래기업 박람회서 신기술 공개',pub_ms:Date.parse('2030-01-03')};
 const request=async()=>new Response('<article itemprop="articleBody"><p>미래기업은 FutureExpo 2030에서 기술을 전시한다.</p></article>',{headers:{'content-type':'text/html'}});
 const result=await enrichNewsEvent(future,request);assert.equal(result.held,false);
 assert.equal(sameNews(result.item,{...future,title:'미래기업 FutureExpo 2030 참가'}),true);
});
