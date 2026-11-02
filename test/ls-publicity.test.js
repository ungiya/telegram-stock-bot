import test from 'node:test';
import assert from 'node:assert/strict';
import { companyNewsAllowed } from '../src/filters.js';
import { normalizeArticle, queuedNewsExcluded } from '../src/worker.js';

test('chairman publicity is rejected at collection and before delivery across rewritten headlines and dates', () => {
  const variants = [
    ['LS일렉트릭', '구자균 LS일렉트릭 회장 “전력의 미래를 이끌겠다”', ''],
    ['LS ELECTRIC', 'LS ELECTRIC, 구자균 회장 기조연설…AI 시대 전력 해법', ''],
    ['LS일렉트릭', 'LS일렉트릭, 글로벌 에너지 혁신 비전 제시', '구자균 회장이 강조했다'],
    ['LS 일렉트릭', 'LS 일렉트릭 구자균 회장, 지능형 전력망 강조', ''],
    ['LS일렉트릭', '구자균 LS일렉트릭 회장 “AI 전력난 해법은 지능형 DC 전력망”', '']
  ];
  const now = Date.UTC(2026, 11, 20);
  for (const [ticker, title, description] of variants) {
    const item = { ticker, title, description, url: 'https://example.com/new-rewrite', pub_ms: now };
    assert.equal(companyNewsAllowed(ticker, title, description), false, title);
    assert.equal(queuedNewsExcluded(item), true, title);
    assert.equal(normalizeArticle({ ...item, originallink: item.url, pubDate: new Date(now).toUTCString() }, ticker, now, [ticker]), null, title);
  }
});
test('concrete LS contract and earnings developments survive chairman background quotations', () => {
  for (const title of ['LS일렉트릭 북미 3000억원 변압기 공급 계약 체결', 'LS일렉트릭 분기 실적 발표, 영업이익 30% 증가']) {
    assert.equal(companyNewsAllowed('LS일렉트릭', title, '구자균 회장은 전력망의 미래를 강조했다'), true);
  }
  assert.equal(companyNewsAllowed('다른회사', '구자균 회장 발표'), true);
});
