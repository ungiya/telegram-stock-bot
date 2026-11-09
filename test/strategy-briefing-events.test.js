import test from 'node:test';
import assert from 'node:assert/strict';
import {strategyBriefingRelation} from '../src/strategy-briefing-events.js';
import {sameNews,coveredNewsEvent} from '../src/news-dedup.js';

const time=Date.parse('2026-11-09T15:35:00+09:00');
const screenshot=[
  {
    ticker:'에이프릴바이오',
    title:'[에이프릴바이오] 에이프릴바이오, 4300억 실탄 확보...내년 기술수출로 기업가치 시험대',
    description:'차상훈 에이프릴바이오 대표이사가 9일 오후 서울 여의도 콘래드에서 발표하고 있다. 에이프릴바이오가 내년 기술수출 성과를',
    url:'https://www.ajunews.com/view/20261109152849898',
    pub_ms:time
  },
  {
    ticker:'에이프릴바이오',
    title:"[에이프릴바이오] 에이프릴바이오, '4300억 실탄' R&D 투입...'내년 3종 기술이전 목표'",
    description:'에이프릴바이오가 신규 핵심 파이프라인 3종을 공개하고 이를 내년 기술이전하겠다는 목표를 제시했다. 4000억원이 넘는 현금 자산을 토대로 다수 신약을 병행 개발하고, 외부 기술을 적극 도입해 초기 성과를 만들겠다.',
    url:'https://www.mt.co.kr/thebio/2026/11/09/2026110915315361344',
    pub_ms:time+60000
  },
  {
    ticker:'에이프릴바이오',
    title:"[에이프릴바이오] [바이오현장] '실탄·우군' 확보한 에이프릴바이오...글로벌 플랫폼 기업 정조준",
    description:'에이프릴바이오가 대규모 투자 유치를 발판으로 신약 연구개발(R&D)을 가속하고 글로벌 플랫폼 바이오 기업으로의 도약에 나선다. 특히 신규 투자자인 TKG그룹과 IMM인베스트먼트는 장기 자본 공급과 글로벌 네트워크를 뒷받침한다.',
    url:'https://www.ebn.co.kr/news/articleView.html?idxno=1730947',
    pub_ms:time+120000
  }
];

test('three real November 9 Aprilbio headlines are one R&D/strategy event across publishers',()=>{
  for(const [i,a] of screenshot.entries()){
    for(const b of screenshot.slice(0,i)){
      assert.equal(strategyBriefingRelation(a,b),true,a.title);
      assert.equal(strategyBriefingRelation(b,a),true,b.title);
      assert.equal(sameNews(a,b),true,a.title);
      assert.equal(sameNews(b,a),true,b.title);
    }
    // The first original strategy story should be ALLOWED until a previous
    // article exists in history: do not blacklist the whole topic globally.
    assert.equal(coveredNewsEvent(a),null,a.title);
  }
});

test('same logic applies to non-biotech tickers, not a hardcoded Aprilbio URL or company',()=>{
 const combos=[
  [
    {ticker:'가상반도체',title:'가상반도체 2500억 실탄으로 내년 생산설비 증설 계획',
      description:'새 공장 생산라인 확대 장기 전략'},
    {ticker:'가상반도체',title:'가상반도체 2500억 실탄 바탕으로 반도체 공장 증설 속도',
      description:'생산 설비 투자 확대를 통한 성장 전략'}
  ],
  [
    {ticker:'가상게임사',title:'가상게임사 1900억 실탄 확보, 내년 신작 게임 개발 확대 계획',
      description:'신작 게임사업 로드맵 발표'},
    {ticker:'가상게임사',title:'가상게임사 1900억 실탄으로 스튜디오 투자·게임 개발 가속',
      description:'내년 신규 게임 사업 성장전략'}
  ],
  [
    {ticker:'가상전력기업',title:'가상전력기업 3800억 실탄으로 전력망 사업 강화 계획',
      description:'차세대 전력 인프라 개발 로드맵'},
    {ticker:'가상전력기업',title:'가상전력기업 3800억 실탄 투입해 글로벌 전력망 공략',
      description:'전력망 사업을 확대하기 위한 중장기 전략'}
  ]
 ];
 for(const [first,second] of combos){
   first.pub_ms=time;second.pub_ms=time+50000;
   assert.equal(strategyBriefingRelation(first,second),true,first.ticker);
   assert.equal(sameNews(first,second),true,first.ticker);
 }
});

test('independent investments, contracts, clinical readouts and different capital figures stay separate',()=>{
 const original=screenshot[0];
 const changes=[
  {...screenshot[1],title:'에이프릴바이오 4300억 실탄 기반 신규 기술수출 계약 체결'},
  {...screenshot[1],title:'에이프릴바이오 4300억 실탄 기반 임상 2상 결과 발표'},
  {...screenshot[1],title:'에이프릴바이오 4300억 실탄 확보 뒤 500억 신규 투자 유치 확정'},
  {...screenshot[1],title:'에이프릴바이오 4300억 실탄 기반 3분기 연결 실적 발표'},
  {...screenshot[1],title:'에이프릴바이오 4300억 실탄 연구개발 전략 정정'},
  {...screenshot[1],title:'에이프릴바이오 3000억 실탄 연구개발 확대...내년 기술이전 목표'}
 ];
 for(const item of changes) {
   assert.equal(strategyBriefingRelation(original,item),false,item.title);
   assert.equal(sameNews(original,item),false,item.title);
 }
 assert.equal(strategyBriefingRelation(original,{...screenshot[1],ticker:'다른회사'}),null);
 assert.equal(sameNews(original,{...screenshot[1],ticker:'다른회사'}),false);
 assert.equal(strategyBriefingRelation(original,{...screenshot[1],pub_ms:time+4*86400000}),null);
});

test('shared corporate wording alone does not merge unrelated strategy events',()=>{
 const original=screenshot[0];
 const unrelated=[
   {ticker:'에이프릴바이오',title:'에이프릴바이오 4300억 실탄으로 글로벌 데이터센터 증설 계획',
     description:'내년 데이터센터 인프라 생산설비 증설 전략',pub_ms:time+60000},
   {ticker:'에이프릴바이오',title:'에이프릴바이오 AI 플랫폼 서비스 신규 계약 체결',
     description:'새로운 고객을 대상으로 사업 확장 계획을 발표',pub_ms:time+60000},
   {ticker:'에이프릴바이오',title:'에이프릴바이오, 신약 치료제 임상 3상 결과 발표',
     description:'기존 연구개발 전략 행사에 대한 설명도 포함',pub_ms:time+60000}
 ];
 for(const item of unrelated){
  assert.notEqual(strategyBriefingRelation(original,item),true,item.title);
  assert.equal(sameNews(original,item),false,item.title);
 }
});
