import test from 'node:test';
import assert from 'node:assert/strict';
import { sameNews } from '../src/news-dedup.js';

export const siemens = {
  ticker: '효성중공업', title: '효성중공업, 지멘스와 디지털 전력망 기술 협력',
  description: "효성중공업이 독일 지멘스와 디지털 전력망과 인공지능(AI) 데이터센터 솔루션 분야에서 협력한다. 효성중공업은 30일 서울 그랜드 인터컨티넨탈 파르나스에서 지멘스와 글로벌 전략적 파트너십 협약(GSPA)을 체결했다."
};
export const otherOutlet = {
  ticker: '효성중공업', title: '효성중공업, 디지털 전력망·AI 데이터센터 공략…獨 지멘스와 맞손',
  description: '한국정경신문 박준규 기자 mlkiza@kakao.com [한국정경신문=박준규 기자] 효성중공업이 독일 지멘스와 협력해 디지털 전력 인프라와 AI 데이터센터 시장 공략에 나선다. 30일 서울 그랜드 인터컨티넨탈 파르나스에서 글로벌 전략적 파트너십 협약을 체결했다.'
};

test('different outlet headlines about the screenshot Siemens partnership are duplicates', () => {
  assert.equal(sameNews(siemens, otherOutlet), true);
  assert.equal(sameNews(otherOutlet, siemens), true);
});
test('punctuation, publisher prefixes and spacing do not create new stories', () => {
  assert.equal(sameNews(siemens, { ...siemens, title: '[단독] 효성중공업 지멘스와 디지털 전력망 기술 협력!' }), true);
});
test('same company alone, short generic titles, or different event facts are not enough', () => {
  assert.equal(sameNews(siemens, { ...siemens, title: '효성중공업, 지멘스와 디지털 전력망 공급 계약 해지', description: '효성중공업은 독일 지멘스와 맺은 공급 계약을 해지했다고 공시했다. 거래 상대방의 사정으로 계약 이행이 불가능해졌다.' }), false);
  assert.equal(sameNews({ ticker: 'A', title: 'A 신제품', description: '' }, { ticker: 'A', title: 'A 신기술', description: '' }), false);
  assert.equal(sameNews(siemens, { ...otherOutlet, ticker: '다른기업' }), false);
  assert.equal(sameNews({ ...siemens, title: '효성중공업 3분기 영업이익 1000억원' }, { ...siemens, title: '효성중공업 3분기 영업이익 1500억원' }), false);
});
