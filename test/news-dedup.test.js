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

test('LS Electric DC/직류 and English company names normalize consistently', () => {
 const base={ticker:'LS일렉트릭',description:'구자균 회장은 AI 전력난에 대응하기 위한 지능형 직류 전력망 구축이 필요하다고 강조했다.'};
 assert.equal(sameNews({...base,title:'구자균 LS일렉트릭 회장 AI 전력난 해법은 지능형 DC 전력망'}, {...base,title:'구자균 LS ELECTRIC 회장 AI 전력난 해법은 지능형 직류 전력망'}),true);
});
test('reported LS speech URL and rewritten coverage are covered without suppressing new contracts', async () => {
 const {coveredNewsEvent}=await import('../src/news-dedup.js');
 const base={ticker:'LS일렉트릭',pub_ms:Date.parse('2026-11-02T01:00Z'),description:''};
 for(const title of ['구자균 LS일렉트릭 회장 “AI 전력난 해법은 지능형 DC 전력망”','LS일렉트릭 구자균, 인공지능 전력 수요 대응 직류 전력망 구축 필요'])
  assert.equal(coveredNewsEvent({...base,title}),'event:ls-electric-koo-ai-dc-grid-2026-11-02');
 assert.equal(coveredNewsEvent({url:'https://www.viva100.com/article/20261102500194?utm_source=naver'}),'event:ls-electric-koo-ai-dc-grid-2026-11-02');
 for(const title of ['LS일렉트릭 AI 데이터센터 직류 전력망 공급 계약 체결','LS일렉트릭 구자균 AI 전력망 신제품 출시','LS일렉트릭 영업이익 증가'])
  assert.equal(coveredNewsEvent({...base,title,description:'구자균은 AI 전력난에 대응한 지능형 DC 전력망 구축이 필요하다고 강조했다.'}),null);
 assert.equal(coveredNewsEvent({...base,pub_ms:Date.parse('2027-01-01T00:00Z'),title:'구자균 AI 지능형 DC 전력망 해법'}),null);
});

test('short excerpt contained in a longer release is duplicate only with matching headline subjects', () => {
 const intro='에이피알은 텍사스 물류센터를 확장해 현지 고객에게 상품을 더 빠르게 배송할 계획이라고 밝혔다.';
 const a={ticker:'에이피알',title:'에이피알 텍사스 물류센터 확장…현지 배송 개선',description:intro};
 const b={ticker:'에이피알',title:'에이피알, 텍사스 물류센터 키워 미국 고객 잡는다',description:intro+' 추가로 회사는 현지 유통망을 정비하고 물류 효율화를 추진한다. 관계자는 이번 시설 운영으로 고객 만족도를 높일 것이라고 설명했다. 북미 사업 확대를 뒷받침하는 장기 전략이다.'};
 assert.equal(sameNews(a,b),true);
 assert.equal(sameNews(a,{...b,title:'에이피알 텍사스 매장에 새 브랜드 입점'}),false);
});


test('reported Kiff launch repeated press release is suppressed across outlets and URL variants', async () => {
 const {coveredNewsEvent,reportedKiffLaunch}=await import('../src/news-dedup.js');
 const now=Date.parse('2026-11-02T17:00:00+09:00');
 const base={ticker:'크래프톤',pub_ms:now,description:'크래프톤이 K팝 아티스트가 만든 캐릭터 챗 Kiff를 국내에 상용화했다.'};
 const headlines=[
  "크래프톤, AI 캐릭터 챗 'Kiff' 서비스 개시…K팝 인공지능 사업 확장",
  "크래프톤, K팝 AI 캐릭터 챗 서비스 '키프' 선보여",
  "크래프톤, K팝 AI 캐릭터 챗 서비스 키프 국내 서비스 시작",
  "크래프톤, AI 캐릭터 채팅 시장 참전…'키프(Kiff)' 출시",
  "크래프톤, K팝 AI 챗 키프 국내 서비스 시작"
 ];
 for(const title of headlines) {
  assert.equal(coveredNewsEvent({...base,title,url:'https://news.example.com/'+title.length}),
    'event:krafton-kiff-kpop-ai-chat-launch-2026-11-02',title);
 }
 const exact={ticker:'크래프톤',url:'https://www.thedailypost.kr/news/articleView.html?idxno=116597&utm_source=naver'};
 assert.equal(coveredNewsEvent(exact),'event:krafton-kiff-kpop-ai-chat-launch-2026-11-02');
 assert.equal(reportedKiffLaunch({...exact,title:'별도 내용',pub_ms:now}),true);
 assert.equal(coveredNewsEvent({...base,title:'크래프톤 키프, 글로벌 10개국 신규 출시 확정'}),null);
 assert.equal(coveredNewsEvent({...base,title:'크래프톤 Kiff 이용자 수 100만 돌파'}),null);
 assert.equal(coveredNewsEvent({...base,title:'크래프톤 키프, 신규 아티스트 계약 체결'}),null);
 assert.equal(coveredNewsEvent({...base,title:'크래프톤 Kiff 매출 100억원 달성'}),null);
 assert.equal(coveredNewsEvent({...base,ticker:'에이피알',title:headlines[0]}),null);
 assert.equal(coveredNewsEvent({...base,pub_ms:Date.parse('2026-12-01T00:00Z'),title:headlines[0]}),null);
});
