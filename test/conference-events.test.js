import test from 'node:test';
import assert from 'node:assert/strict';
import { sameNews, coveredNewsEvent } from '../src/news-dedup.js';
import { conferenceRelation, reportedPharmGynCongress } from '../src/conference-events.js';
import { normalizeArticle, queuedNewsExcluded } from '../src/worker.js';

const oct = Date.parse('2026-11-02T10:00:00+09:00');
const first = {
  ticker:'파마리서치',
  title:"파마리서치, 주요 산부인과 학술대회서 창상피복재 '자이너' 선봬",
  description:'파마리서치는 최근 열린 주요 산부인과 추계학술대회에 잇달아 참가해 독자적인 PN 기술력을 집중 홍보하고 있다. 지난달 18일 스위스그랜드호텔에서 개최했다.',
  url:'https://www.medisobizanews.com/news/articleView.html?idxno=143891',
  pub_ms:oct
};
const second = {
  ticker:'파마리서치',
  title:'파마리서치, 산부인과 추계학술대회서 PN 관련 임상 사례 공유',
  description:'파마리서치가 산부인과 학술대회에서 폴리뉴클레오타이드(PN) 기술과 창상피복재를 소개했다. 지난 10월 18일 스위스그랜드호텔에서 열린 직선제대한산부인과개원의사회 제22차 추계학술대회에 참가했다.',
  url:'https://www.pharmnews.com/news/articleView.html?idxno=307548',
  pub_ms:oct + 8*3600000
};

test('two user-reported syndications of same gyn meeting are one event despite product emphasis', () => {
  assert.equal(conferenceRelation(first,second),true);
  assert.equal(sameNews(first,second),true);
  assert.equal(sameNews(second,first),true);
});

test('both already-delivered URLs and rewritten meeting copy are held at intake and queue', () => {
  const key='event:pharmaresearch-gyn-congress-22-oct-18-2026';
  for (const item of [first, second]) {
    assert.equal(coveredNewsEvent(item),key);
    assert.equal(coveredNewsEvent({ticker:'파마리서치',url:item.url}),key);
    assert.equal(queuedNewsExcluded(item),true);
    const naverArticle={
      title:item.title,
      description:item.description,
      originallink:item.url,
      link:'https://n.news.naver.com/mnews/article/123/000045',
      pubDate:new Date(item.pub_ms).toUTCString()
    };
    assert.equal(normalizeArticle(naverArticle,'파마리서치',oct+86400000),null);
  }
  assert.equal(coveredNewsEvent({
    ...second,url:'https://another-outlet.example/123',
    title:'파마리서치 산부인과 추계학술대회 참석…자이너 소개'
  }),key);
});

test('genuine findings and different congress editions remain independent news', () => {
  assert.equal(conferenceRelation(first,{...second,title:'파마리서치 제23차 산부인과 추계학술대회 참석'}),false);
  assert.equal(conferenceRelation(first,{...second,title:'파마리서치 제22차 산부인과 춘계학술대회 참석'}),false);
  assert.equal(conferenceRelation(first,{...second,title:'파마리서치 산부인과 학술대회서 임상 3상 결과 발표'}),false);
  assert.equal(coveredNewsEvent({...second,title:'파마리서치 산부인과 추계학술대회서 임상 3상 결과 발표',url:'https://fresh.example/a'}),null);
  assert.equal(coveredNewsEvent({...second,title:'파마리서치 산부인과 추계학술대회서 신규 공급 계약 체결',url:'https://fresh.example/b'}),null);
  assert.equal(coveredNewsEvent({...second,title:'파마리서치 제23차 산부인과 추계학술대회 참가',url:'https://fresh.example/c'}),null);
  assert.equal(coveredNewsEvent({...second,pub_ms:Date.parse('2027-11-02T00:00:00Z'),url:'https://fresh.example/d'}),null);
  assert.equal(coveredNewsEvent({...second,ticker:'에이피알',url:'https://fresh.example/e'}),null);
});

test('a later unrelated season and unrelated specialty are not grouped', () => {
  assert.equal(conferenceRelation(first,{...second,pub_ms:oct+22*86400000}),null);
  assert.equal(conferenceRelation(first,{...second,title:'파마리서치 정형외과 추계학술대회서 PN 사례 공유'}),null);
  assert.equal(conferenceRelation(first,{...second,ticker:'에이피알'}),null);
  assert.equal(reportedPharmGynCongress({...second,title:'파마리서치 산부인과 춘계학술대회서 PN 사례 공유',url:'https://fresh.example/f'}),false);
});

test('named conference participation dedup works across all companies, years and product headlines',()=>{
 const a={ticker:'엘앤씨바이오',title:'엘앤씨바이오, 대한수부외과학회 참가…ECM 기반 재건 기술력 선보여',description:"지난달 31일부터 이달 1일까지 진행된 2026년 대한수부외과학회 추계학술대회 및 연수에 참가해 신경 및 연부조직 재건 분야의 주요 제품과 임상 적용 가능성을 소개했다.",pub_ms:Date.parse('2026-11-04T10:30:00+09:00')};
 const b={...a,title:'엘앤씨바이오, 대한수부외과학회 참가…신경·연부조직 재건 솔루션 소개',description:'메가너브 프라임 중심 제품군 전시…국내 대형병원 약 40곳서 임상 적용 확대. 2026년 대한수부외과학회 추계학술대회 및 연수에 참가해 인체조직 세포외기질(ECM)...'};
 assert.equal(conferenceRelation(a,b),true);
 assert.equal(sameNews(a,b),true);assert.equal(sameNews(b,a),true);
 assert.equal(sameNews({...a,ticker:'다른회사',pub_ms:Date.parse('2030-11-04'),description:a.description.replace('2026','2030')},{...b,ticker:'다른회사',pub_ms:Date.parse('2030-11-04'),description:b.description.replace('2026','2030')}),true);
 for(const item of [{...b,description:b.description.replace('추계','춘계')},{...b,description:b.description.replace('2026','2027')},{...b,title:'엘앤씨바이오 대한수부외과학회 임상 3상 결과 발표'},{...b,title:'엘앤씨바이오 대한정형외과학회 참가'}]) assert.notEqual(conferenceRelation(a,item),true,item.title);
});
