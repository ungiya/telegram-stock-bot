import test from 'node:test';
import assert from 'node:assert/strict';
import { crossPublisherAnnouncementRelation } from '../src/cross-publisher-announcements.js';
import { sameNews } from '../src/news-dedup.js';

const now=Date.parse('2026-11-06T13:00:00+09:00');
const entry=(ticker,title,description,time=now)=>({ticker,title,description,pub_ms:time,
  url:'https://publisher.example/item/'+encodeURIComponent(title)});
const scenarios=[
 {ticker:'테스트기업',
  first:entry('테스트기업','테스트기업 스마트팩토리 플랫폼 ArgoFlow 공개',
    '공장 설비를 통합 제어하는 스마트팩토리 플랫폼 ArgoFlow를 개발 완료해 선보였다.'),
  second:entry('테스트기업','테스트기업 제조공장 설비 제어 플랫폼 개발 완료',
    '공장 설비를 통합 제어하는 스마트팩토리 플랫폼 ArgoFlow를 공개했다.',now+60000)},
 {ticker:'서진시스템',
  first:entry('서진시스템','서진시스템 ESS 배터리관리시스템 VoltGrid 선보여',
    '북미 에너지저장용 배터리관리시스템 VoltGrid를 공개했다.'),
  second:entry('서진시스템','서진시스템 북미 ESS 장비 핵심 관리기술 개발 성공',
    '북미 에너지저장용 배터리관리시스템 VoltGrid를 개발 완료하고 첫 모델을 선보였다.',now+60000)},
 {ticker:'루닛',
  first:entry('루닛','루닛 의료특화 AI 러닝유닛 2.0 공개',
    '의과학 특화 파운데이션 모델 프로젝트를 완수하여 진료보조 업무를 지원하는 모델을 선보였다.'),
  second:entry('루닛','루닛 병원 업무용 파운데이션 모델 개발 완료',
    '의료 특화 파운데이션 모델 프로젝트를 완수해 진료 보조업무에 적용했다.',now+60000)},
 {ticker:'가상반도체',
  first:entry('가상반도체','가상반도체 첨단 반도체 설비 예지진단 AI 모듈 선봬',
    '가상반도체는 산업용 AI 기반 설비예지진단 시스템을 공개하고 제조시설에 도입하겠다고 밝혔다.'),
  second:entry('가상반도체','가상반도체 제조업 생산효율 개선 프로젝트 개발완료',
    '가상반도체가 산업용 AI 기반 설비예지진단 시스템의 개발을 완료했다고 밝혔다.',now+60000)}
];

test('one general rule detects syndicated first announcements for every company without ticker branches',()=>{
 for(const {ticker,first,second} of scenarios){
   assert.equal(crossPublisherAnnouncementRelation(first,second),true,ticker);
   assert.equal(crossPublisherAnnouncementRelation(second,first),true,ticker);
   assert.equal(sameNews(first,second),true,ticker);
   assert.equal(sameNews(second,first),true,ticker);
 }
});

test('material new milestones, distinct versions, new periods and companies do not become duplicates',()=>{
 const {first,second}=scenarios[0];
 const separate=[
   {...second,title:'테스트기업 ArgoFlow 신규 공급 계약 체결'},
   {...second,title:'테스트기업 ArgoFlow 신규 기능 업데이트 공개'},
   {...second,title:'테스트기업 ArgoFlow 추가 해외 출시'},
   {...second,title:'테스트기업 ArgoFlow 실증 결과 발표'},
   {...second,title:'테스트기업 ArgoFlow 2.0 독립 검증 발표'},
   {...second,title:'테스트기업 ArgoFlow 2.0 FDA 승인'},
   {...second,title:'테스트기업 ArgoFlow 개발 발표 정정'},
   {...second,title:'테스트기업 ArgoFlow 매출 100억원 돌파'},
   {...second,title:'테스트기업 ArgoFlow 특허 등록'},
   {...second,title:'테스트기업 ArgoFlow 2.1 신규 모델 공개'}
 ];
 for(const other of separate){
   assert.notEqual(crossPublisherAnnouncementRelation(first,other),true,other.title);
   assert.equal(sameNews(first,other),false,other.title);
 }
 assert.equal(crossPublisherAnnouncementRelation(first,{...second,ticker:'다른기업'}),null);
 assert.equal(sameNews(first,{...second,ticker:'다른기업'}),false);
 assert.equal(crossPublisherAnnouncementRelation(first,{...second,pub_ms:now+8*86400000}),null);
 assert.equal(crossPublisherAnnouncementRelation(first,{...second,pub_ms:now-8*86400000}),null);
 const version=entry('테스트기업','테스트기업 ArgoFlow 2.0 공개',
   '스마트팩토리 플랫폼 ArgoFlow 2.0 통합 제어 모델 개발 완료');
 assert.equal(crossPublisherAnnouncementRelation(version,{...version,title:'테스트기업 ArgoFlow 3.0 공개'}),false);
 assert.equal(sameNews(version,{...version,title:'테스트기업 ArgoFlow 3.0 공개'}),false);
});

test('avoid merging different branded products or generic repeated corporate boilerplate',()=>{
 const a=entry('테스트기업','테스트기업 AI 플랫폼 ArgoFlow 출시',
   '기업은 스마트팩토리 솔루션을 통해 공장의 생산효율을 높이는 AI 기반 통합제어 플랫폼을 공개했다.');
 const b={...a,title:'테스트기업 AI 플랫폼 BetaPulse 출시'};
 assert.equal(crossPublisherAnnouncementRelation(a,b),false);
 assert.equal(sameNews(a,b),false);
 const boiler=entry('테스트기업','테스트기업 AI 제품 소개',
   '당사는 글로벌 시장에서 첨단 인공지능 기술을 기반으로 사업을 확대하고 기술 경쟁력을 강화하고 있다.');
 const other={...boiler,title:'테스트기업 AI 기술 개발 발표'};
 assert.equal(crossPublisherAnnouncementRelation(boiler,other),null);
 assert.equal(sameNews(boiler,other),false);
});

test('quoted old project background does not overrule a new contract or clinical outcome',()=>{
 const initial=scenarios[2].first;
 for(const title of [
   '루닛 러닝유닛 2.0 대학병원 공급 계약 체결',
   '루닛 러닝유닛 2.0 임상 3상 결과 발표',
   '루닛 러닝유닛 2.0 독립 정확도 향상 결과 발표',
   '루닛 의료특화 파운데이션 모델 정정 공시',
   '루닛 러닝유닛 2.1 후속 모델 공개'
 ]) {
   const newStory={...initial,title,pub_ms:now+3600000};
   assert.notEqual(crossPublisherAnnouncementRelation(initial,newStory),true,title);
   assert.equal(sameNews(initial,newStory),false,title);
 }
});
