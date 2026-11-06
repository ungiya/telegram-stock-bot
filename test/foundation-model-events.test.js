import test from 'node:test';
import assert from 'node:assert/strict';
import { reportedLunitLearningUnit20, learningUnitReleaseRelation } from '../src/foundation-model-events.js';
import { sameNews, coveredNewsEvent } from '../src/news-dedup.js';
import { normalizeArticle, queuedNewsExcluded } from '../src/worker.js';

const pub=Date.parse('2026-11-06T09:50:00+09:00');
const key='event:lunit-learningunit20-foundation-model-launch-2026-11-06';
const first={
  ticker:'루닛',pub_ms:pub,
  title:"[루닛] 루닛, 의료 특화 AI '러닝유닛 2.0' 공개",
  description:"사진=루닛 제공 의료 인공지능(AI) 기업 루닛은 23개 산·학·연·병으로 구성된 컨소시엄이 과학기술정보통신부의 '인공지능 특화 파운데이션 모델' 프로젝트를 완수, 의료 특화 파운데이션 모델인 '러닝유닛 2.0'을 공개했다.",
  url:'https://daily.hankooki.com/news/articleView.html?idxno=1422512'
};
const second={
  ticker:'루닛',pub_ms:pub+60000,
  title:'[루닛] 루닛, 의료 특화 AI 모델 개발 완료…진료·병원행정 등 의료 현장서 실증',
  description:"이투데이 이상민 기자 루닛은 정부의 국가 전략사업인 '의과학 특화 파운데이션 모델' 프로젝트를 완수했다고 밝혔다. 프로젝트 제안 단계에서 4종의 의료 벤치마크를 대상으로 세계 최고 수준의 정확도를 달성하겠다는 목표를 제시했다.",
  url:'https://www.etoday.co.kr/news/view/2644883'
};

test('same event for user screenshots: Learning Unit 2.0 vs medical foundation-model development',()=>{
  assert.equal(reportedLunitLearningUnit20(first),true);
  assert.equal(reportedLunitLearningUnit20(second),true);
  assert.equal(learningUnitReleaseRelation(first,second),true);
  assert.equal(sameNews(first,second),true);
  assert.equal(sameNews(second,first),true);
  assert.equal(coveredNewsEvent(first),key);
  assert.equal(coveredNewsEvent(second),key);
  assert.equal(queuedNewsExcluded(first),true);
  assert.equal(queuedNewsExcluded(second),true);
});

test('two original URLs and paraphrases are filtered at intake and from existing queue',()=>{
  const date=pub+3*3600000;
  for(const item of [first,second]) {
    assert.equal(normalizeArticle({
      title:item.title,description:item.description,originallink:item.url,
      link:'https://n.news.naver.com/mnews/article/111/1234',
      pubDate:new Date(item.pub_ms).toUTCString()
    },'루닛',date),null,item.title);
    assert.equal(queuedNewsExcluded(item),true,item.url);
    assert.equal(coveredNewsEvent({...item,title:'언론사가 제목 변경',description:'',pub_ms:undefined}),key,
      'already delivered exact article must not be resent with modified metadata');
  }
  const third={
    ...second,
    url:'https://third-press.example/news/20261106',
    title:'루닛 국가전략 의과학 특화 파운데이션 모델 프로젝트 개발 성공…의료 현장 실증',
    description:'컨소시엄이 모델 개발을 완료해 성과를 공개했다.'
  };
  assert.equal(coveredNewsEvent(third),key);
  assert.equal(sameNews(first,third),true);
});

test('genuinely new outcomes and model versions are separate events',()=>{
  const later=[
    {...first,url:'https://other.example/v21',title:'루닛 러닝유닛 2.1 신규 모델 발표',description:'이전 러닝유닛 2.0 공개 이후 후속 버전을 발표했다.'},
    {...first,url:'https://other.example/contract',title:'루닛 러닝유닛 2.0 병원 공급 계약 체결'},
    {...first,url:'https://other.example/bench',title:'루닛 러닝유닛 2.0 독립 벤치마크 결과 발표'},
    {...first,url:'https://other.example/trial',title:'루닛 러닝유닛 2.0 실제 임상 결과 발표'},
    {...first,url:'https://other.example/approval',title:'루닛 러닝유닛 2.0 FDA 허가 승인'},
    {...first,url:'https://other.example/live',title:'루닛 러닝유닛 2.0 대학병원 첫 도입 확정'},
    {...first,url:'https://other.example/profit',title:'루닛 3분기 실적 발표…러닝유닛 2.0 공개'},
    {...first,url:'https://other.example/rev',title:'루닛 러닝유닛 2.0 공개 정정'},
    {...first,url:'https://other.example/otherproduct',title:'루닛 새 유방암 진단 AI 모델 공개',description:'다른 제품을 발표했다.'},
    {...first,url:'https://other.example/old',pub_ms:Date.parse('2026-08-03T11:00:00+09:00')},
    {...first,url:'https://other.example/newyear',pub_ms:Date.parse('2027-01-03T11:00:00+09:00')}
  ];
  for(const item of later){
    assert.equal(reportedLunitLearningUnit20(item),false,item.title);
    assert.equal(coveredNewsEvent(item),null,item.title);
    assert.notEqual(learningUnitReleaseRelation(first,item),true,item.title);
  }
  assert.equal(coveredNewsEvent({...first,ticker:'크래프톤',url:'https://unrelated.example/article'}),null);
  assert.equal(learningUnitReleaseRelation(first,{...second,ticker:'씨어스'}),null);
});



test('later user screenshots: truncated Wide Economy title and News1 "hospital validation complete" are the same release',()=>{
  const at=Date.parse('2026-11-06T11:15:00+09:00');
  const variants=[
    {ticker:'루닛',pub_ms:at,
      title:"[루닛] '원내 서버서 진료 보조부터 원무까지'…루닛, 오픈소스 의료 AI '러닝유...",
      description:"의료 인공지능(AI) 전문기업 루닛이 병원 내부 전산망에서 독립적으로 구동하며 진료와 행정 전반을 지원하는 의료 특화 파운데이션 모델을 선보였다. 루닛은 과학기술정보통신부 주관 국가 전략 과제인 '의과학 특화...",
      url:'https://www.wedaily.com/news/articleView.html?idxno=303039'},
    {ticker:'루닛',pub_ms:at+4*60000,
      title:"[루닛] 루닛, 의료 특화 AI '러닝유닛 2.0' 공개…병원 현장 실증 완료",
      description:"의료 인공지능(AI) 기업 루닛(328130)이 의료기관의 진료와 행정 업무를 지원하는 의료 특화 파운데이션 모델을 공개했다. 의료 관련 질문에 답하는 수준을 넘...",
      url:'https://www.news1.kr/bio/healthcare/6345418'}
  ];
  for(const item of variants){
    assert.equal(reportedLunitLearningUnit20(item),true,item.title);
    assert.equal(coveredNewsEvent(item),key,item.title);
    assert.equal(queuedNewsExcluded(item),true,item.title);
    assert.equal(sameNews(first,item),true,item.title);
    assert.equal(sameNews(item,second),true,item.title);
    assert.equal(normalizeArticle({
      title:item.title,description:item.description,originallink:item.url,
      pubDate:new Date(item.pub_ms).toUTCString()
    },'루닛',at+3600000),null,item.title);
    // It is not enough to block the two URL strings; a new outlet's paraphrase
    // must be rejected by the EVENT identity as well.
    assert.equal(reportedLunitLearningUnit20({...item,url:'https://thirdpress.example/news/unknown'}),true,item.title);
  }
  assert.equal(learningUnitReleaseRelation(variants[0],variants[1]),true);
  for(const item of variants) {
    assert.equal(coveredNewsEvent({...item,description:'',title:'다른 제목',pub_ms:undefined}),key,
      'permanently block the exact already-delivered user-reported URL');
  }
});

test('new independent verification after model launch is not confused with original rollout',()=>{
  const newer=[
    '루닛 러닝유닛 2.0 독립 실증 완료…임상 성과 발표',
    '루닛 러닝유닛 2.0 신규 병원 도입 계약 체결',
    '루닛 러닝유닛 2.0 새로운 2.1 모델 출시'
  ];
  for(const title of newer){
    const x={...first,url:'https://another-press.example/material',title};
    assert.equal(reportedLunitLearningUnit20(x),false,title);
    assert.equal(coveredNewsEvent(x),null,title);
  }
});
