import test from 'node:test';
import assert from 'node:assert/strict';
import {earningsProfile,earningsRelation,reportedAlteogenQ3} from '../src/earnings-events.js';
import {sameNews,coveredNewsEvent} from '../src/news-dedup.js';
import {normalizeArticle,queuedNewsExcluded} from '../src/worker.js';

const t=Date.parse('2026-11-03T11:37:00+09:00');
const stories=[
  {
    ticker:'알테오젠',url:'https://www.cbci.co.kr/news/articleView.html?idxno=622579',
    title:'[속보] 알테오젠, 3분기 영업이익 788억9500만원…전년 동기 대비 195.8% 증가',
    description:'알테오젠이 올해 3분기 연결기준 영업이익 788억9500만원을 기록한 것으로 잠정 집계됐다. 이는 전년 동기 대비 195.8% 증가한 수치다.',
    pub_ms:t,
  },
  {
    ticker:'알테오젠',url:'https://news.einfomax.co.kr/news/articleView.html?idxno=4442737',
    title:'알테오젠, 3분기 영업이익 789억원…전년비 3배 증가',
    description:'알테오젠이 올해 3분기 연결 기준 영업이익으로 전년 동기 대비 3배 가까이 상승한 789억 원을 기록했다. 잠정 실적으로 매출액 1천190억 원...',
    pub_ms:t+4*60000,
  },
  {
    ticker:'알테오젠',url:'https://news.mtn.co.kr/article/2026110311512133841',
    title:'알테오젠, 창립 이래 첫 분기 매출 1000억원 돌파…기술료 수익 확대 영향',
    description:'알테오젠이 창립 이래 처음으로 분기 매출 1000억원을 돌파했다. 영업이익도 전년 동기 대비 3배 가까이 증가하며 호실적을 기록했다. 3일 전자공시시스템에 따르면 알테오젠은 올해 3분기 영업이익 788억9500만원을...',
    pub_ms:t+19*60000,
  }
];

test('three actual Alteogen earnings publications are one event despite different headlines and 788.95 versus 789 rounding',()=>{
  const profiles=stories.map(earningsProfile);
  for(const profile of profiles)assert.deepEqual(
    {year:profile.year,quarter:profile.quarter,phase:profile.phase},
    {year:2026,quarter:3,phase:'reported'});
  for(let i=0;i<stories.length;i++)for(let j=0;j<stories.length;j++) {
    if(i===j)continue;
    assert.equal(earningsRelation(stories[i],stories[j]),true,i+' vs '+j);
    assert.equal(sameNews(stories[i],stories[j]),true,i+' vs '+j);
  }
});

test('Alteogen Q3 coverage is rejected from Naver collection and existing pending queues',()=>{
  const marker='event:alteogen-q3-2026-earnings-release';
  for(const item of stories){
    assert.equal(reportedAlteogenQ3(item),true,item.url);
    assert.equal(coveredNewsEvent(item),marker,item.url);
    assert.equal(queuedNewsExcluded(item),true,item.url);
    assert.equal(coveredNewsEvent({ticker:'알테오젠',url:item.url}),marker,'exact delivered URL '+item.url);
    const naver={
      originallink:item.url,
      link:'https://news.naver.com/000',
      title:item.title,
      description:item.description,
      pubDate:new Date(item.pub_ms).toUTCString()
    };
    assert.equal(normalizeArticle(naver,'알테오젠',item.pub_ms+3600000),null);
  }
  assert.equal(coveredNewsEvent({...stories[2],url:'https://another.example/earnings2026'}),marker);
});

test('all companies share quarter-level earnings dedup without merging distinct reports, corrections or forecasts',()=>{
  const base={...stories[0],ticker:'서진시스템',url:'https://a.example/q3'};
  const other={...stories[2],ticker:'서진시스템',url:'https://b.example/q3'};
  assert.equal(sameNews(base,other),true,'another company should use same earnings-event rule');
  assert.equal(sameNews(base,{...other,title:'서진시스템, 4분기 매출 1000억원 돌파',description:'4분기 순이익 상승'}),false);
  assert.equal(sameNews(base,{...other,pub_ms:Date.parse('2027-11-03T11:30:00+09:00'),description:'2027년 3분기 매출 상승'}),false);
  assert.equal(sameNews(base,{...other,ticker:'에이피알'}),false);
  const corrected={...other,title:'서진시스템 3분기 매출 실적 정정 공시'};
  assert.equal(earningsProfile(corrected).phase,'revision');
  assert.equal(sameNews(base,corrected),false,'a corrected filing is a real follow-up');
  const forecast={...other,title:'서진시스템 3분기 매출 실적 전망'};
  assert.equal(earningsProfile(forecast).phase,'forecast');
  assert.equal(sameNews(base,forecast),false);
  const trial={...stories[0],url:'https://new.example/trial',
    title:'알테오젠 임상 3상 결과 발표…3분기 매출도 성장'};
  assert.equal(earningsProfile(trial),null,'new trial outcomes must not be classified as a repeated earnings release');
  assert.equal(reportedAlteogenQ3(trial),false);
  assert.equal(reportedAlteogenQ3({...stories[0],url:'https://a.example/corrected',
     title:'알테오젠 3분기 실적 정정 공시…수정된 매출 발표'}),false);
});

test('earnings dedup does not block legitimate prior-year earnings and future quarters',()=>{
  const story={...stories[0],url:'https://new.example/future'};
  assert.equal(reportedAlteogenQ3({...story,pub_ms:Date.parse('2027-11-03T12:00:00+09:00')}),false);
  assert.equal(reportedAlteogenQ3({...story,title:'알테오젠 4분기 영업이익 789억원'}),false);
  assert.equal(reportedAlteogenQ3({...story,title:'알테오젠 2025년 3분기 영업이익 789억원'}),false);
  assert.equal(reportedAlteogenQ3({...story,ticker:'파마리서치'}),false);
  assert.equal(reportedAlteogenQ3({...story,title:'알테오젠 3분기 영업이익 정정공시'}),false);
});

test('new screenshots: 3Q spelling and omitted quarter with 789억 profit',()=>{
 const a={ticker:'알테오젠',title:'알테오젠, 분기 매출 첫 1000억원 돌파 … 영업이익은 789억원',description:'알테오젠이 창사 이래 처음으로 분기 매출 1000억원을 넘어섰다. 파트너사 MSD의 키트루다 피하주사(SC) 제형 판매가 늘면서 알테오젠이 받는 판매 마일스톤이 증가했고 신규 기술수출 2건도...',pub_ms:t,url:'https://biz.newdaily.co.kr/site/data/html/2026/11/03/2026110300228.html'};
 const b={...a,title:"'키트루다SC 판매확대·기술수출 2건' 알테오젠, 3Q 영업익 789억·전년동...",description:'알테오젠이 올해 3분기 연결 실적을 잠정 집계한 결과 영업이익이 789억원으로 전년 동기 267억원 대비 195.8% 증가했다.',url:'https://www.catchnews.kr/news/articleView.html?idxno=130146'};
 assert.equal(earningsProfile({...b,description:''}).quarter,3);
 for(const x of [a,b]) {assert.ok(coveredNewsEvent(x));assert.equal(queuedNewsExcluded(x),true);}
 assert.equal(sameNews(a,b),true);assert.equal(sameNews(b,a),true);
 assert.equal(sameNews({...a,ticker:'다른회사'},{...b,ticker:'다른회사'}),true);
 for(const suffix of [' 전망',' 정정',' 신규 공급 계약 체결']) {
  assert.equal(reportedAlteogenQ3({...a,title:a.title+suffix}),false);
 }
 assert.equal(reportedAlteogenQ3({...a,pub_ms:t+10*86400000}),false);
 assert.notEqual(earningsRelation(a,{...b,title:'다른 영업이익',description:'올해 3분기 영업이익 500억원'}),true);
});
