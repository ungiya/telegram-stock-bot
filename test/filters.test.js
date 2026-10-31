import test from 'node:test';
import assert from 'node:assert/strict';
import { newsAllowed } from '../src/filters.js';
import { ALIASES, WATCHLIST } from '../src/watchlist.js';
import { normalizeArticle } from '../src/worker.js';

test('Termux defaults preserve all 25 operational companies and aliases', () => {
  assert.equal(WATCHLIST.length, 25);
  for (const name of ['씨어스', 'sk이노베이션', '에이치브이엠']) assert.ok(WATCHLIST.includes(name));
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
