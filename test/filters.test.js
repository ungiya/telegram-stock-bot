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
  assert.equal(allowed('에이피알 영업이익 증가에 주가 강세'), true);
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
