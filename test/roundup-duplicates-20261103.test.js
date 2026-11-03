import test from 'node:test';
import assert from 'node:assert/strict';
import { laborStage,laborRelation,reportedHyosungStrikeNotice } from '../src/labor-events.js';
import { promotionalNewsExcluded,newsAllowed } from '../src/filters.js';
import { sameNews,coveredNewsEvent } from '../src/news-dedup.js';
import { normalizeArticle,queuedNewsExcluded } from '../src/worker.js';

const when=Date.parse('2026-11-03T12:38:00+09:00');
const first={
  ticker:'효성중공업',
  url:'https://www.mdtoday.co.kr/news/articleView.html?idxno=622617',
  title:'효성중공업 노조 “임금 인상, 물가에도 못 미쳐”…첫 파업 예고',
  description:'효성중공업 사무기술직 노동조합이 4일부터 72시간 전면파업을 예고했다.',
  pub_ms:when-2*3600000
};
const reports=[
 {ticker:'효성중공업',
  url:'https://magazine.hankyung.com/business/article/202611032664b',
  title:'“영업익 106% 늘었으니 임금 10% 올려 달라”…효성중공업 사무노조 첫 파업',
  description:'효성중공업 사무기술직 노동조합이 오는 4일부터 3일간 파업을 예고한 가운데 회사가 창원공장 정상 가동 방침을 밝혔다. 생산현장 기능직 근로자들은 파업 대상이 아닌 만큼 생산활동과 고객 대응에는 차질이 없도록 하겠다.',
  pub_ms:when-3*60000},
 {ticker:'효성중공업',
  url:'https://www.businesskorea.co.kr/news/articleView.html?idxno=280312',
  title:"효성중공업, 사무노조 파업 예고 '법과 원칙 대응' 천명",
  description:'효성중공업 사무기술직 노동조합이 72시간 전면파업을 예고한 가운데 사측이 원칙 없는 양보나 일방적인 요구 수용은 없다는 입장을 내놨다. 회사는 노조의 파업 예고에 깊은 유감을 표하며 법과 절차에 따른 대응을 이어가겠다고 밝혔다.',
  pub_ms:when
 }
];
const apr={
  ticker:'에이피알',
  url:'https://www.ekn.kr/web/view.php?key=20261103021004692',
  title:'[똑똑한케어] 에이피알, 아모레퍼시픽, 더파운더즈 아누아, 애경산업 루나, 메디필, 키오',
  description:'◇ 에이피알 메디큐브, 미국·유럽 4개 도시 팝업에 1만5000명 방문 에이피알의 뷰티 브랜드 메디큐브가 미국과 유럽 주요 도시에서 진행한 릴레이 팝업스토어에 총 1만5000여명의 방문객을 모았다. 에이피알에 따르면...',
  pub_ms:when
};

test('Hankyung and BusinessKorea company response to pending strike are already reported notice',()=>{
  const marker='event:hyosung-wage-union-first-strike-warning-2026-11-03';
  for(const item of reports){
    assert.equal(laborStage(item),'announced',item.url);
    assert.equal(laborRelation(first,item),true,item.url);
    assert.equal(sameNews(first,item),true,item.url);
    assert.equal(reportedHyosungStrikeNotice(item),true,item.url);
    assert.equal(coveredNewsEvent(item),marker,item.url);
    assert.equal(queuedNewsExcluded(item),true,item.url);
    assert.equal(coveredNewsEvent({ticker:item.ticker,url:item.url}),marker);
    const naver={title:item.title,description:item.description,originallink:item.url,pubDate:new Date(item.pub_ms).toUTCString()};
    assert.equal(normalizeArticle(naver,'효성중공업',item.pub_ms+3600000),null,item.url);
  }
  assert.equal(laborRelation(reports[0],reports[1]),true);
  assert.equal(coveredNewsEvent({...reports[0],url:'https://other.example/same-story'}),marker);
  assert.equal(coveredNewsEvent({...reports[1],url:'https://other.example/rewrite'}),marker);
});

test('future actual labor walkout and wage negotiation settlement are distinct news',()=>{
  const started={...reports[0],url:'https://another.example/walkout',
    title:'효성중공업 노조 4일 실제 파업 돌입…창원공장 일부 업무 중단',
    pub_ms:Date.parse('2026-11-04T11:00:00+09:00')};
  const settlement={...reports[1],url:'https://another.example/settled',
    title:'효성중공업 노사 임금협상 타결…파업 철회'};
  for(const item of [started,settlement]){
    assert.equal(coveredNewsEvent(item),null,item.title);
    assert.equal(sameNews(first,item),false,item.title);
  }
});

test('APR beauty roundup with popup visitors in excerpt is promotional even without promo words in headline',()=>{
  assert.equal(promotionalNewsExcluded(apr.ticker,apr.title,apr.description),true);
  assert.equal(newsAllowed(apr.ticker,['에이피알'],apr.title,apr.description),false);
  assert.equal(queuedNewsExcluded(apr),true);
  const naver={title:apr.title,description:apr.description,originallink:apr.url,pubDate:new Date(apr.pub_ms).toUTCString()};
  assert.equal(normalizeArticle(naver,'에이피알',apr.pub_ms+3600000),null);
  const rewritten={...apr,title:'[오늘의 뷰티 뉴스] 에이피알, 아모레퍼시픽 등 화장품 기업 소식'};
  assert.equal(promotionalNewsExcluded(rewritten.ticker,rewritten.title,rewritten.description),true);
});

test('APR material investment news still passes even with popup PR in background',()=>{
  for(const title of [
    '에이피알 3분기 영업이익 1606억원 발표…메디큐브 팝업 방문객 늘어',
    '에이피알 미국 매출 1000억원 기록, 글로벌 팝업 인기',
    '에이피알 신제품 출시, 메디큐브 팝업 행사 병행',
    '에이피알 신규 공급 계약 체결…유럽 팝업 병행',
  ]) {
    assert.equal(promotionalNewsExcluded('에이피알',title,apr.description),false,title);
    assert.equal(newsAllowed('에이피알',['에이피알'],title,apr.description),true,title);
  }
  assert.equal(promotionalNewsExcluded('에이피알',
    '[똑똑한케어] 에이피알, 아모레퍼시픽 소식',
    '에이피알이 3분기 실적을 발표했고 신규 공급 계약을 체결했다.'),false);
  assert.equal(promotionalNewsExcluded('크래프톤',apr.title,apr.description),false);
});
