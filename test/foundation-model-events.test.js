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
    assert.equal(learningUnitReleaseRelation(first,item),null,item.title);
  }
  assert.equal(coveredNewsEvent({...first,ticker:'크래프톤',url:'https://unrelated.example/article'}),null);
  assert.equal(learningUnitReleaseRelation(first,{...second,ticker:'씨어스'}),null);
});
