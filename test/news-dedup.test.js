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

test('incidental date versus amount does not veto identical press release summaries', () => {
  const a={ticker:'효성중공업',title:'효성중공업 30일 지멘스와 1000억원 전력망 협약',description:siemens.description};
  const b={...a,title:'효성중공업 지멘스와 1000억원 전력망 협약 체결'};
  assert.equal(sameNews(a,b),true);
});
test('decimal amounts and quarters protect material follow-ups, including summary-only updates', () => {
  const a={...siemens,title:'효성중공업 전력망 공급계약 소식',description:'효성중공업은 지멘스와 전력망 장비 공급 계약을 체결했다. 계약 금액은 1.5조원으로 지난해 매출 대비 중요한 규모다.'};
  const b={...a,title:'효성중공업 전력망 공급계약 발표',description:a.description.replace('1.5조원','1.8조원')};
  assert.equal(sameNews(a,b),false);
  assert.equal(sameNews({...a,title:'효성중공업 3분기 실적 발표'}, {...a,title:'효성중공업 4분기 실적 발표'}),false);
  assert.equal(sameNews({...a,title:'효성중공업 지멘스 1조원 공급계약 체결'}, {...a,title:'효성중공업 지멘스 10,000억원 공급계약 체결'}),true);
});
test('same summary and paraphrased title are duplicates but cancellation is a new event', () => {
  const a={...siemens,title:'효성중공업 지멘스와 전략적 파트너십'};
  const b={...siemens,title:'효성중공업 지멘스와 맞손, 디지털 전력망 확대'};
  assert.equal(sameNews(a,b),true);
  assert.equal(sameNews(a,{...b,title:'효성중공업 지멘스와 전략적 파트너십 해지'}),false);
});
test('generic company boilerplate cannot merge stories about different counterparties', () => {
  const description='효성중공업은 글로벌 전력기기 시장에서 사업을 확대하고 있다. 올해 해외 시장 수요 증가에 대응하며 성장을 이어가고 있다.';
  assert.equal(sameNews({ticker:'효성중공업',title:'효성중공업 지멘스 전력망 공급계약',description},{ticker:'효성중공업',title:'효성중공업 한전 변압기 공급계약',description}),false);
});

test('the already delivered Siemens GSPA is covered regardless of excerpt, with bounded follow-up protection', async () => {
  const {coveredNewsEvent} = await import('../src/news-dedup.js');
  const base={ticker:'효성중공업',pub_ms:Date.parse('2026-11-02T00:00Z'),description:''};
  for (const title of ['효성중공업, 지멘스와 디지털 전력망 기술 협력','효성중공업 지멘스와 AI 데이터센터 공략 맞손','효성중공업 Siemens GSPA 체결','효성중공업, 지멘스와 디지털 전력망·AI 데이터센터 시장 공략'])
    assert.equal(coveredNewsEvent({...base,title}),'event:hyosung-siemens-gspa-2026-10-30');
  for (const title of ['효성중공업 지멘스와 전력망 협약 해지','효성중공업 지멘스와 디지털 전력망 신규 공급 계약','효성중공업 지멘스 협력 이후 영업이익 증가','효성중공업 한전과 전력망 협약'])
    assert.equal(coveredNewsEvent({...base,title}),null);
  assert.equal(coveredNewsEvent({...base,...siemens,pub_ms:Date.parse('2027-01-01T00:00Z')}),null);
});

test('known Musinsa CD appointment groups person and role aliases but preserves follow-ups', async () => {
  const {coveredNewsEvent}=await import('../src/news-dedup.js');
  const base={ticker:'무신사',pub_ms:Date.parse('2026-11-02T00:00Z'),description:''};
  for(const title of ['무신사 스탠다드, 크리에이티브 디렉터로 김지용 선임','무신사 김지용 영입','지용킴 품은 무신사 스탠다드…글로벌 캐주얼로 체질 개선','무신사 스탠다드 JiyongKim CD 발탁'])
    assert.equal(coveredNewsEvent({...base,title}),'event:musinsa-jiyongkim-cd-2026-10-30');
  for(const title of ['무신사 김지용 CD 사임','무신사 김지용 대표이사 선임','무신사 김지용 영입 이후 첫 컬렉션 출시','무신사 김철수 크리에이티브 디렉터 선임'])
    assert.equal(coveredNewsEvent({...base,title}),null);
  assert.equal(coveredNewsEvent({...base,title:'무신사 디자인 혁신 위해 새 디렉터 영입',description:'지용킴 김지용을 크리에이티브 디렉터로 선임했다.'}),'event:musinsa-jiyongkim-cd-2026-10-30');
  assert.equal(coveredNewsEvent({...base,title:'무신사 김지용 선임',pub_ms:Date.parse('2027-01-01T00:00Z')}),null);
});

test('PGS and global symposium aliases identify already received event despite rewritten titles', async () => {
  const {coveredNewsEvent}=await import('../src/news-dedup.js');
  const base={ticker:'파마리서치',pub_ms:Date.parse('2026-11-02T01:00Z'),description:''};
  for(const title of ['파마리서치 글로벌 심포지엄 성료','파마리서치 글로벌 심포지움 성료','파마리서치 PGS 개최…재생의학 글로벌 리더십 강화','파마리서치 PharmaResearch Global Symposium 의료진 교류','파마리서치 강릉 심포지엄 개최'])
    assert.equal(coveredNewsEvent({...base,title}),'event:pharmaresearch-pgs-2026-10');
  assert.equal(coveredNewsEvent({...base,title:'파마리서치 재생의학 리더십 강화',description:'글로벌 의료진이 참여한 PGS를 개최했다.'}),'event:pharmaresearch-pgs-2026-10');
  for(const title of ['파마리서치 PGS에서 임상 3상 결과 발표','파마리서치 영업이익 증가','파마리서치 목표주가 상향','파마리서치 신제품 출시','파마리서치 2027 PGS 개최','파마리서치 제8회 글로벌 심포지엄 개최'])
    assert.equal(coveredNewsEvent({...base,title,description:'PGS에서 재생의학을 논의했다.'}),null);
  assert.equal(coveredNewsEvent({...base,title:'파마리서치 사우디아라비아 론칭 심포지엄 개최'}),null);
  assert.equal(coveredNewsEvent({...base,title:'파마리서치 PGS 개최',pub_ms:Date.parse('2027-11-02T00:00Z')}),null);
});
