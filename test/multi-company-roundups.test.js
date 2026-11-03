import test from 'node:test';
import assert from 'node:assert/strict';
import { isMultiCompanyRoundup } from '../src/multi-company-roundups.js';
import { newsAllowed } from '../src/filters.js';
import { ALIASES } from '../src/watchlist.js';
import { normalizeArticle, queuedNewsExcluded } from '../src/worker.js';

const today=Date.parse('2026-11-03T15:25:00+09:00');
const cases=[
  {
    ticker:'크래프톤',
    title:'[게임 브리핑] 컴투스·엔씨·크래프톤',
    description:"[사진=크래프톤 제공] ◇ 크래프톤, 지스타 2026 현장 프로그램 공개. 크래프톤은 오는 19~22일 부산 벡스코에서 개최되는 지스타 2026에서 주요 현장 프로그램을 운영한다.",
    url:'https://www.niceeconomy.co.kr/news/articleView.html?idxno=91676'
  },
  {
    ticker:'크래프톤',
    title:'[게임월드] 크래프톤·엔씨·NC AI·카카오게임즈·컴투스',
    description:"▲엔씨 리니지M 한국광고학회 수상 ▲크래프톤, 지스타 2026에서 아이브와 협업 프로그램 선보인다. 오는 19~22일 부산 벡스코에서 현장 프로그램 공개",
    url:'https://www.dnews.co.kr/uhtml/view.jsp?idxno=202611031142511790387'
  },
  {
    ticker:'에이피알',
    title:'[산업 브리핑] 에이피알·아모레퍼시픽·애경산업',
    description:'◇에이피알 3분기 실적 발표 ▲아모레퍼시픽 뷰티 신상품 공개',
    url:'https://roundup.example/beauty'
  },
  {
    ticker:'크래프톤',
    title:'[오늘의 게임 소식] 크래프톤, 넷마블, 넥슨',
    description:'크래프톤 지스타 2026 방문객 발표 ▲넷마블 게임 동향',
    url:'https://roundup.example/daily'
  },
  {
    ticker:'크래프톤',
    title:'[크래프톤] [게임 브리핑] 컴투스·엔씨·크래프톤',
    description:'게임사 묶음 소식',
    url:'https://roundup.example/labeled'
  },
  {
    ticker:'sk이노베이션',
    title:'[산업 동향] sk이노베이션·한화솔루션·삼성전자',
    description:'SK이노베이션 배터리 투자 ▲한화솔루션 신사업',
    url:'https://roundup.example/industrial'
  }
];

test('multi-company publisher digests are rejected generally, across stock tickers',()=>{
  for(const item of cases) {
    assert.equal(isMultiCompanyRoundup(item.title),true,item.title);
    assert.equal(newsAllowed(item.ticker,ALIASES[item.ticker],item.title,item.description),
      false,item.title);
    assert.equal(queuedNewsExcluded({ticker:item.ticker,title:item.title,description:item.description,
      url:item.url,pub_ms:today}),true,item.title);
    assert.equal(normalizeArticle({originallink:item.url,title:item.title,
      description:item.description,pubDate:new Date(today).toUTCString()},item.ticker,today),null,item.title);
  }
});

test('one-company material updates and company comparisons are not incorrectly rejected',()=>{
  const keep=[
    ['크래프톤','크래프톤, 지스타 2026 현장 프로그램 공개'],
    ['크래프톤','크래프톤 3분기 매출 1조원 발표'],
    ['크래프톤','크래프톤·넷마블, 게임 시장 신작 경쟁'],
    ['크래프톤','[게임 브리핑] 크래프톤 신작 게임 발표'],
    ['에이피알','에이피알 3분기 영업이익 1606억원 기록'],
    ['sk이노베이션','SK이노베이션 신규 공급계약 체결'],
    ['씨어스','씨어스와 아이쿱, 의료 데이터 연동 서비스 확대'],
    ['효성중공업','효성중공업 노사, 임금 협상 타결']
  ];
  for(const [ticker,title] of keep) {
    assert.equal(isMultiCompanyRoundup(title),false,title);
    assert.equal(newsAllowed(ticker,ALIASES[ticker],title),true,title);
  }
  assert.equal(isMultiCompanyRoundup('[산업 브리핑] 크래프톤 신작 게임 공개'),false);
  assert.equal(isMultiCompanyRoundup('[게임월드] 지스타 2026 크래프톤 단독 인터뷰'),false);
});

test('digest rule does not require any pre-listed URL, event year or publisher',()=>{
  const titles=[
    '[게임 브리핑] 컴투스·엔씨·크래프톤',
    '[게임 브리핑] 카카오게임즈·엔씨·크래프톤',
    '[게임월드] 크래프톤·넷마블·컴투스',
    '[기업 브리핑] 에이피알·아모레퍼시픽·애경산업',
  ];
  for(const title of titles)assert.equal(isMultiCompanyRoundup(title),true,title);
});
