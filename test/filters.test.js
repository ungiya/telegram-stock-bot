import test from 'node:test';
import assert from 'node:assert/strict';
import { newsAllowed } from '../src/filters.js';
import { ALIASES, WATCHLIST } from '../src/watchlist.js';
import { normalizeArticle } from '../src/worker.js';

test('Termux defaults preserve all 26 operational companies and aliases', () => {
  assert.equal(WATCHLIST.length, 26);
  for (const name of ['달바글로벌', '씨어스', 'sk이노베이션', '에이치브이엠']) assert.ok(WATCHLIST.includes(name));
  assert.deepEqual(ALIASES['LS일렉트릭'], ['LS일렉트릭', 'LS ELECTRIC']);
});
test('exclude promotional and price-only headlines, retain material news', () => {
  const allowed = title => newsAllowed('에이피알', ['에이피알'], title);
  assert.equal(allowed('에이피알 할인 쿠폰 증정'), false);
  assert.equal(allowed('에이피알 주가 급등'), false);
  assert.equal(allowed('에이피알 영업이익 증가에 주가 강세'), false);
  assert.equal(allowed('에이피알 AI 기자 자동 작성'), false);
  assert.equal(allowed('다른 회사 영업이익 증가'), false);
});
test('exclude Krafton tournaments but retain business results', () => {
  const allowed = title => newsAllowed('크래프톤', ['크래프톤'], title);
  assert.equal(allowed('크래프톤 PGC 결승 개최'), false);
  assert.equal(allowed('크래프톤 신작 공개 및 대회 개최'), true);
});
test('article normalization applies aliases and filters to cleaned fields', () => {
  const now = Date.now();
  const article = {title:'<b>LS ELECTRIC</b> 공급 계약', originallink:'https://example.com/1', pubDate:new Date(now).toUTCString()};
  assert.ok(normalizeArticle(article, 'LS일렉트릭', now));
  assert.equal(normalizeArticle({...article, title:'LS ELECTRIC 주가 급등'}, 'LS일렉트릭', now), null);
});

test('Musinsa fashion/editorial and designer appointments are excluded; corporate headlines survive', () => {
  for (const title of ['무신사 스탠다드 김지용 크리에이티브 디렉터 선임','무신사 겨울 패딩 신제품 출시','무신사 지용킴 품고 글로벌 캐주얼 체질 개선','무신사 코디 추천','무신사 새 컬렉션 룩북 공개'])
    assert.equal(newsAllowed('무신사',['무신사'],title,'지난해 매출이 증가했다.'),false);
  assert.equal(newsAllowed('무신사',['무신사'],'무신사 새로운 도전','김지용 디자이너를 영입해 패션 상품을 만든다.'),false);
  for(const title of ['패션 플랫폼 무신사 IPO 예비심사 청구','무신사 영업이익 증가','무신사 투자 유치','무신사 해외 진출 확대','무신사 대표이사 선임'])
    assert.equal(newsAllowed('무신사',['무신사'],title,'패션 플랫폼 무신사 소식'),true);
  assert.equal(newsAllowed('에이피알',['에이피알'],'에이피알 신제품 출시'),true);
});


test('news blocks target-price revisions and analyst commentary for all tickers', () => {
  const allowed=(ticker,title,description='') => newsAllowed(ticker,[ticker],title,description);
  for(const title of [
    '에이피알 목표주가 21만원으로 상향',
    '에이피알 목표가 하향 조정',
    '에이피알 목표주가 유지…증권가 전망',
    '에이피알 투자의견 중립에서 매수로 상향',
    '하나증권 에이피알 매수 의견 유지',
    'KB증권 에이피알 실적 개선 전망',
    '에이피알 추천주 부상…증권사 분석',
  ]) assert.equal(allowed('에이피알',title),false,title);
  assert.equal(allowed('크래프톤','크래프톤 목표가 상향'),false);
  assert.equal(allowed('무신사','무신사 투자의견 매수 유지'),false);
  assert.equal(allowed('에이피알','에이피알 상승 여력 커졌다','하나증권이 목표주가를 상향했다'),false);
});

test('corporate events are not hidden just because an excerpt cites an analyst', () => {
  const allow=(ticker,title,description='')=>newsAllowed(ticker,[ticker],title,description);
  assert.equal(allow('에이피알','에이피알 3분기 영업이익 1606억원 기록','하나증권이 목표주가를 하향했다'),true);
  assert.equal(allow('에이피알','에이피알 공급 계약 체결','증권가는 성장할 것으로 전망했다'),true);
  assert.equal(allow('디앤디파마텍','디앤디파마텍 DD01 임상 2상 결과 발표','하나증권이 목표가를 상향했다'),true);
  assert.equal(allow('무신사','무신사 IPO 예비심사 청구'),true);
  assert.equal(allow('에이피알','삼성증권, 에이피알 지분 인수'),true);
});


test('Musinsa designer hiring remains blocked even when headline mentions IPO, sales or expansion', () => {
  const blocked = [
    '무신사 스탠다드 김지용 크리에이티브 디렉터 선임',
    '무신사 IPO 앞두고 김지용 CD 영입',
    '지용킴 품은 무신사 스탠다드…글로벌 캐주얼로 체질 개선',
    '무신사 새 디자이너 발탁…해외 진출 속도',
    '무신사 스탠다드 새 디렉터 선임, 매출 2조 목표',
    '무신사 글로벌 브랜드 협업 컬렉션 선보여 실적 성장 기대',
    '무신사 패션 브랜드 매출 1조 돌파',
    '무신사 할인 행사 매출 100억원 돌파',
    '무신사 IPO 준비 중 브랜드 콜라보',
    '무신사 스탠다드 해외 매장 오픈',
    '무신사 뷰티 팝업스토어 오픈',
    '무신사 새 시즌 룩북 화보',
  ];
  for (const title of blocked)
    assert.equal(newsAllowed('무신사',['무신사'],title,'무신사의 기업가치, 상장과 매출 성장 내용도 언급했다.'),false,title);
  assert.equal(newsAllowed('무신사',['무신사'],'무신사 새로운 도전',
    '김지용 디자이너를 영입하고 패션 상품을 공개한다.'),false);
});

test('Musinsa material IPO, earnings and financing are still delivered', () => {
  const accepted = [
    '패션 플랫폼 무신사 IPO 예비심사 청구',
    '무신사 상장예비심사 청구서 접수',
    '무신사 3분기 영업이익 300억원 발표',
    '무신사 지난해 연결 매출 1조원 기록',
    '무신사 투자 유치 1000억원',
    '무신사 대표이사 선임',
  ];
  for(const title of accepted)
    assert.equal(newsAllowed('무신사',['무신사'],title,'패션 플랫폼의 기업 활동'),true,title);
  assert.equal(newsAllowed('에이피알',['에이피알'],'에이피알 신제품 출시'),true);
});


test('APR marketing publicity is blocked, material developments are preserved', async () => {
  const { promotionalNewsExcluded } = await import('../src/filters.js');
  const rejected=[
    '에이피알 메디큐브 글로벌 인기 브랜드 선정',
    '에이피알, 뷰티 캠페인 성료…해외서도 인기',
    '에이피알, 미국 아마존 뷰티 랭킹 1위 달성',
    '에이피알 브랜드 앰버서더 새 광고 영상 공개',
    '에이피알 뷰티 체험 팝업 오픈',
    '에이피알, 메디큐브 완판 행진 화제',
    '에이피알, SNS 틱톡 인플루언서 캠페인'
  ];
  for (const title of rejected) {
    assert.equal(promotionalNewsExcluded('에이피알',title,'매출도 늘어날 것으로 기대한다'),true,title);
    assert.equal(newsAllowed('에이피알',['에이피알'],title,'올해 해외 매출이 성장했다.'),false,title);
  }
  const allowed=[
    '에이피알 3분기 연결 매출 7731억원 기록',
    '에이피알 3분기 영업이익 1606억원 발표',
    '에이피알 메디큐브 신제품 출시',
    '에이피알 EBD 신기기 출시 공개',
    '에이피알 미국 현지 공장 신설 착공',
    '에이피알 1000억원 공급 계약 체결',
    '에이피알 美 FDA 승인 취득',
    '에이피알 미국 매출 1000억원 기록…뷰티 랭킹 1위',
    '에이피알 3분기 실적 발표…글로벌 인기 브랜드 1위'
  ];
  for (const title of allowed) {
    assert.equal(promotionalNewsExcluded('에이피알',title),false,title);
    assert.equal(newsAllowed('에이피알',['에이피알'],title),true,title);
  }
  assert.equal(promotionalNewsExcluded('크래프톤','크래프톤 신규 게임 출시'),false);
});
