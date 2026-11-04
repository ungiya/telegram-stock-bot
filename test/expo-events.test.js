import test from 'node:test';
import assert from 'node:assert/strict';
import { reportedKraftonGstarBriefing, gstarProgramRelation } from '../src/expo-events.js';
import { coveredNewsEvent, sameNews } from '../src/news-dedup.js';
import { normalizeArticle, queuedNewsExcluded } from '../src/worker.js';

const date=Date.parse('2026-11-03T14:16:00+09:00');
const event='event:krafton-gstar-2026-program-briefing-2026-11-03';
const article=(title,description,url,n=0)=>({ticker:'크래프톤',title,description,url,pub_ms:date+n*60000});
const examples=[
  article('크래프톤, 지스타 2026 현장 프로그램 공개',
    '크래프톤은 오는 11월 19일부터 22일까지 부산 벡스코에서 열리는 국제 게임 전시회 지스타 2026에서 운영할 주요 현장 프로그램을 3일 공개했다. 올해 10년 연속 참가한다.',
    'http://www.inews24.com/view/2022038'),
  article('크래프톤, 지스타 2026서 신작 5종 시연 및 체험형 프로그램 마련',
    '국제 게임 전시회 지스타 2026에 참가하는 크래프톤이 핵심 라인업과 체험형 프로그램, 아이브 협업 전시 콘텐츠를 마련했다.',
    'https://www.thedailypost.kr/news/articleView.html?idxno=116616',1),
  article('크래프톤, 지스타 현장 프로그램 공개…펍지G·아이브 협업 공간 마련',
    '크래프톤이 지스타 2026에서 출품작 5종을 중심으로 시연과 아이브 협업 현장 프로그램을 운영한다고 3일 밝혔다.',
    'https://zdnet.co.kr/view/?no=20261103142021',2),
  article('크래프톤, 지스타 10년 연속 참가…아이브 협업 앞세워 현장 공략',
    '크래프톤이 오는 지스타 2026에서 인기 지식재산권 협업과 신작 시연을 결합한 전시 공간을 마련한다.',
    'https://www.e-science.co.kr/news/articleView.html?idxno=138827',3),
  article("크래프톤, '지스타 2026'서 신작 4종 시연",
    '크래프톤은 지스타 2026에서 주요 현장 프로그램을 공개했고 신작 네 종을 시연한다.',
    'https://www.khgames.co.kr/news/articleView.html?idxno=309956',4),
  article('PUBG 전장에 아이브 뜬다(?)…크래프톤, 지스타 2026 체험 콘텐츠 확대',
    '크래프톤은 지스타 2026에서 PUBG와 아이브 협업을 오프라인 공간으로 확장하고 다양한 체험 프로그램을 공개했다.',
    'https://www.youthdaily.co.kr/news/article.html?no=229292',5)
];

test('all six screenshot variants map to the same G-STAR 2026 program briefing',()=>{
  for(let i=0;i<examples.length;i++){
    const item=examples[i];
    assert.equal(reportedKraftonGstarBriefing(item),true,item.title);
    assert.equal(coveredNewsEvent(item),event,item.title);
    assert.equal(queuedNewsExcluded(item),true,item.title);
    for(let j=0;j<i;j++){
      assert.equal(gstarProgramRelation(item,examples[j]),true,item.title);
      assert.equal(sameNews(item,examples[j]),true,item.title);
      assert.equal(sameNews(examples[j],item),true,examples[j].title);
    }
  }
});

test('all six articles are ignored before Naver ingestion',()=>{
  for(const item of examples) {
    const incoming={
      originallink:item.url,
      link:'https://n.news.naver.com/mnews/article/123/456789',
      title:item.title,description:item.description,
      pubDate:new Date(item.pub_ms).toUTCString()
    };
    assert.equal(normalizeArticle(incoming,'크래프톤',date+3600000),null,item.title);
  }
});

test('reworded press coverage is blocked even without an exact article URL',()=>{
  const different=article(
    '크래프톤 지스타 프로그램 체험 부스 마련…아이브·PUBG 협업 눈길',
    '부산 벡스코에서 열리는 2026 지스타 행사에서 시연과 체험 공간을 준비한다.',
    'https://independent-outlet.example/20261103/krafton-gstar');
  assert.equal(coveredNewsEvent(different),event);
  assert.equal(sameNews(examples[0],different),true);
  assert.equal(queuedNewsExcluded(different),true);
  for(const item of examples){
    assert.equal(coveredNewsEvent({...item,title:'unrelated newer headline',description:'',pub_ms:undefined}),event,
      'confirmed previously delivered URLs do not resurface with rewritten metadata');
  }
});

test('new contracts, actual releases, an independently unveiled named game, 2027 expo and after-opening outcomes survive',()=>{
  const newStories=[
    article('크래프톤, 지스타 2026에서 신규 퍼블리싱 계약 체결',
      '크래프톤은 새로운 파트너와 게임 서비스 계약을 발표했다.','https://new.example/gstar-contract'),
    article('크래프톤, 지스타 2026 현장에서 신작 정식 출시일 발표',
      '게임 출시일을 새롭게 확정했다.','https://new.example/gstar-release'),
    article("크래프톤, 지스타 2026서 신작 '프로젝트 이글' 세계 최초 공개",
      '새 게임을 최초 공개했다.','https://new.example/gstar-new-ip'),
    article('크래프톤, 지스타 2027 현장 프로그램 공개',
      '2027년 지스타 행사에서 공개될 새로운 라인업','https://new.example/gstar-2027'),
    article('크래프톤 지스타 2026 행사 성과 발표…방문객 수 집계',
      '전시 성과를 새로 공개했다.','https://new.example/attendance'),
    article('크래프톤, 지스타 2026에서 공연 취소',
      '관련 프로그램 취소를 발표했다.','https://new.example/cancellation'),
    article('크래프톤, 3분기 실적 발표…지스타 2026 프로그램도 소개',
      '실제 영업이익 실적 공시','https://new.example/earnings'),
    article('크래프톤 지스타 2026 현장 프로그램 공개',
      '2026년 행사가 끝난 뒤 후속 분석', 'https://new.example/2027-reprint',0),
    article('크래프톤, 지스타 2026 현장 게임 시연',
      '실제 11월 19일 행사 현장 스케치', 'https://new.example/actual-show',0)
  ];
  // After the date window a headline must not be classed as the already seen preview.
  newStories[7].pub_ms=Date.parse('2026-12-01T09:00:00+09:00');
  newStories[8].pub_ms=Date.parse('2026-11-19T09:00:00+09:00');
  for(const item of newStories){
    assert.equal(reportedKraftonGstarBriefing(item),false,item.title);
    assert.equal(coveredNewsEvent(item),null,item.title);
    // A verbatim republish of the original briefing stays a duplicate,
    // even if the narrow known-event date window has expired.
    if (item.url !== 'https://new.example/2027-reprint')
      assert.equal(sameNews(examples[0],item),false,item.title);
  }
  assert.equal(sameNews(examples[0],newStories[7]),true,'identical old story republished remains a duplicate');
  assert.equal(coveredNewsEvent({...examples[0],ticker:'넷마블',url:'https://not-reported.example'}),null);
});

test('all companies group the same named expo despite distinct technology focus and absent headline year',()=>{
 const a={ticker:'효성중공업',pub_ms:Date.parse('2026-11-04T11:00:00+09:00'),title:'효성중공업, 광주 BIXPO 2026 참가…HVDC 국산화 핵심 기술 첫 선',description:"효성중공업이 4일부터 6일까지 광주 김대중컨벤션센터에서 열리는 BIXPO(빛가람 국제전력기술 엑스포) 2026에 참가해 차세대 전력망 솔루션을 공개한다."};
 const b={...a,title:'효성중공업, HVDC 국산화 기술 앞세워 BIXPO 참가',description:'효성중공업이 전압형 초고압 직류 송전(HVDC)과 반도체 변압기(SST) 등 차세대 전력망 기술을 앞세워 국내외 전력·에너지 업계와 기술 교류에 나선다. 한국전력의 대용량 전압형 HVDC 국산화...'};
 assert.equal(sameNews(a,b),true);assert.equal(sameNews(b,a),true);
 const future={...a,ticker:'다른기업',pub_ms:Date.parse('2030-11-04'),title:a.title.replace('BIXPO 2026','EnergyExpo 2030'),description:'EnergyExpo 2030 참가해 전력 장비를 전시한다.'};
 assert.equal(sameNews(future,{...future,title:'다른기업 EnergyExpo 참가…반도체 변압기 첫 선'}),true);
 for(const item of [{...b,title:'효성중공업 BIXPO 2027 참가'},{...b,title:'효성중공업 BIXPO에서 신규 공급 계약 체결'},{...b,title:'효성중공업 BIXPO 참가 후 수주액 100억원 기록'}])assert.equal(sameNews(a,item),false,item.title);
});
