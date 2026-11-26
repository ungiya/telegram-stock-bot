// 뉴스 필터: "주가에 영향을 줄 만한 기사"만 통과시킨다.
//
// 원칙 (회사·날짜·기사별 예외 규칙을 두지 않는다)
//  1. 제목에 관심 종목 이름(별칭)이 있어야 한다.
//  2. 질 낮은 매체, 사진·칼럼·인사·부고, 시세 기사, 증권사 목표가 기사,
//     여러 회사를 묶은 브리핑 기사는 제외한다.
//  3. 제목에 실적·계약·자본·지배구조·임상/허가·설비·법적 리스크 같은
//     "중요 사건" 단어가 있어야 한다.
//  4. 할인·이벤트·봉사·수상 같은 홍보성 단어가 있으면, 확실한 중요 사건
//     (실적 발표, 수주, 인수, 증자, 허가 등)이 함께 있을 때만 통과한다.

export const norm = value => String(value).toLowerCase().replace(/[^\p{L}\p{N}_]/gu, '');

// 사용자가 차단해 온 매체 (하위 도메인 포함)
export const BLOCKED_SOURCES = [
  'vegannews.co.kr', 'insight.co.kr', 'pinpointnews.co.kr', 'metroseoul.co.kr', 'emetro.co.kr',
  '4th.kr', 'newsquest.co.kr', 'megaeconomy.co.kr', 'hellot.net', 'ttlnews.com', 'economytalk.kr',
  'job-post.co.kr', 'wemakenews.co.kr', 'catchnews.kr', 'thepublic.kr', 'wikileaks-kr.org',
  'itooza.com', 'topstarnews.net', 'cbci.co.kr',
];
export function blockedNewsSource(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/\.$/, '');
    return BLOCKED_SOURCES.some(domain => host === domain || host.endsWith('.' + domain));
  } catch { return false; }
}

// ── 중요 사건 단어 ────────────────────────────────────────────────
const MATERIAL = new RegExp([
  // 실적
  '실적', '매출', '영업\\s*이익', '영업익', '영업\\s*손실', '영업\\s*손익', '순이익', '순손실', '당기\\s*순',
  '흑자', '적자', '어닝', '컨센서스', '가이던스', '(?:역대|사상)\\s*최대', '분기\\s*최대', '거래액',
  // 계약·수주
  '수주', '계약', '납품', '단일\\s*판매', '수출',
  // 자본·주주
  '증자', '전환\\s*사채', '교환\\s*사채', '신주인수권', '\\bcb\\b', '\\bbw\\b', '\\beb\\b', '자사주', '자기\\s*주식',
  '소각', '배당', '액면\\s*분할', '감자', '주주\\s*환원', '밸류업', '블록\\s*딜', '오버행', '보호\\s*예수',
  '공개\\s*매수', '지분', '최대\\s*주주', '경영권', '인수', '합병', '\\bm\\s*&\\s*a\\b', '매각', '물적\\s*분할', '인적\\s*분할',
  '상장', '\\bipo\\b', '공모', '예비\\s*심사', '거래\\s*정지', '관리\\s*종목', '투자\\s*(?:주의|경고|위험)',
  '시가\\s*총액', '시총', '기업\\s*가치', '밸류에이션', '투자\\s*유치', '시리즈\\s*[a-f]\\b', '프리\\s*ipo', '자금\\s*조달',
  // 바이오·허가
  '임상', '\\bfda\\b', '\\bema\\b', '식약처', '품목\\s*허가', '허가', '승인', '기술\\s*(?:이전|수출)', '라이선스',
  '\\bl/?o\\b', '로열티', '마일스톤', '신약', '\\bcrl\\b', '톱\\s*라인', '탑\\s*라인', '\\bnda\\b', '\\bbla\\b', '\\bind\\b', '특허',
  // 설비·생산
  '공장', '증설', '생산\\s*능력', '\\bcapa\\b', '착공', '준공', '양산',
  // 법·리스크
  '소송', '제재', '과징금', '횡령', '배임', '압수\\s*수색', '기소', '구속', '리콜', '감사\\s*의견', '회생', '파산',
  '부도', '분식', '공정위', '검찰', '세무\\s*조사', '파업', '해킹', '유출', '화재', '철회', '해지', '무산', '결렬',
  '사실\\s*무근', '부인', '중단', '연기',
  // 경영
  '대표\\s*이사', '\\bceo\\b', '신임\\s*대표', '사임', '사퇴', '구조\\s*조정', '희망\\s*퇴직', '감원',
  // 게임·제품 (실적에 직결되는 큰 출시)
  '신작', '정식\\s*출시', '글로벌\\s*출시', '출시일', '출시\\s*연기',
  // 단독 보도
  '\\[단독\\]',
].join('|'), 'i');

// 홍보성 단어가 있어도 통과시킬 만큼 확실한 사건
const STRONG = new RegExp([
  '(?:잠정|분기|연간|반기)\\s*실적', '영업\\s*이익', '영업익', '순이익', '매출\\s*[\\d,.]+\\s*(?:조|억)', '흑자\\s*전환', '적자\\s*전환',
  '수주', '공급\\s*계약', '계약\\s*체결', '인수', '합병', '증자', '전환\\s*사채', '자사주', '배당', '최대\\s*주주', '경영권',
  '임상', '허가', '\\bfda\\b', '기술\\s*(?:이전|수출)', '상장', '\\bipo\\b', '소송', '횡령', '배임', '과징금', '투자\\s*유치',
].join('|'), 'i');

// ── 제외 단어 ─────────────────────────────────────────────────────
// 제목 맨 앞 머리표: 사진·영상·칼럼·인사·부고 등
const NON_NEWS_HEADER = /^\s*[[【〈<(]\s*(?:포토|사진|영상|화보|카드\s*뉴스|인포그래픽|인터뷰|칼럼|사설|기고|오피니언|기자\s*수첩|데스크|시론|광고|pr|ad|이벤트|게시판|인사|부고|동정|알림|공지|오늘의\s*운세|퀴즈)/i;
// 시세 기사: 주가 움직임 자체를 다룬 기사 (원인 뉴스는 별도로 받는다)
const PRICE = /특징주|상한가|하한가|신고가|신저가|52주|주가.{0,12}(?:상승|하락|급등|급락|강세|약세|반등|출렁|껑충|뚝)|\d+(?:\.\d+)?\s*%\s*(?:상승|하락|급등|급락|↑|↓|강세|약세)|(?:급등|급락|상승|하락)\s*\d+(?:\.\d+)?\s*%|장중|시간외|마감\s*시황|개장\s*시황|오전장|오후장|순매수|순매도|공매도\s*잔고|거래량\s*(?:급증|폭발)|주식\s*(?:시세|현재가)|\[(?:마감|개장|시황|증시)/i;
// 증권사 목표가·투자의견 기사 (리포트 알림으로 따로 받는다)
const ANALYST = /목표\s*(?:주가|가)|적정\s*주가|투자\s*의견|\btarget\s*price\b|(?:매수|매도|중립)\s*(?:의견|유지|상향|하향)|커버리지\s*개시/i;
// 홍보·행사·사회공헌
const PROMO = /할인|쿠폰|기획전|타임딜|특가|증정|사은품|이벤트|프로모션|체험단|경품|선착순|팝업|봉사|기부|후원|나눔|캠페인|홍보\s*대사|앰버서더|(?:모델|뮤즈)\s*(?:발탁|선정)|수상|시상|어워드|어워즈|선정|인증\s*(?:획득|취득)|박람회|전시회|참가|세미나|간담회|채용|공채|인턴|축제|페스티벌|콘서트|팬\s*미팅|굿즈|콜라보|컬래버|화보|룩북|컬렉션|신메뉴|럭키\s*드로우|라이브\s*커머스|체험|e[\s-]*스포츠|이스포츠|대회|우승|결승|본선|예선/i;
// 여러 회사를 묶은 브리핑·모음 기사
const ROUNDUP_HEADER = /^\s*[[【〈<]\s*[^\]】〉>]{0,20}(?:브리핑|모음|오늘의|위클리|주간|이슈\s*체크|한눈에|업계\s*소식|소식|핫\s*이슈|단신|종목\s*톡|투자\s*노트|리포트\s*브리핑)/i;
// AI 자동작성·광고 고지
const AUTOMATIC = /AI\s*기자|인공지능\s*기자|로봇\s*기자|자동\s*(?:생성|작성)|기업\s*PR|유료\s*광고|협찬\s*기사|본\s*기사는?\s*광고/i;

// 회사 특성상 꼭 필요한 최소 예외 (사업 홍보가 실적 단어를 자주 쓰는 경우)
const COMPANY_EXCLUDE = {
  '와디즈': /메이커|서포터|리워드|프로젝트|펀딩\s*(?:오픈|참여|성공|달성|모금|진행)/,
  '무신사': /디자이너|디렉터|룩북|입점|착장|스타일링|코디|(?:브랜드|상품)\s*(?:출시|론칭|런칭)/,
};

function bulletRoundup(title) {
  // "A·B·C" 처럼 가운뎃점으로 3개 이상 나열하거나, ▲/■ 머리표가 2개 이상인 기사
  const head = title.split(/[,…]/)[0];
  return (head.match(/[·ㆍ]/g) || []).length >= 2 || (title.match(/[▲■◆▶●]/g) || []).length >= 2;
}

// 기사를 판정하고 제외 사유를 돌려준다. 통과하면 null.
export function newsRejectReason(ticker, aliases, title, description = '') {
  const headline = String(title || '').normalize('NFKC');
  const text = headline + ' ' + String(description || '').normalize('NFKC');
  const names = [ticker, ...(aliases || [])];
  if (!names.some(alias => norm(alias) && norm(headline).includes(norm(alias)))) return 'not_in_title';
  if (NON_NEWS_HEADER.test(headline)) return 'non_news';
  if (AUTOMATIC.test(text)) return 'automatic';
  if (ROUNDUP_HEADER.test(headline) || bulletRoundup(headline)) return 'roundup';
  if (PRICE.test(headline)) return 'price';
  if (ANALYST.test(headline)) return 'analyst';
  if (COMPANY_EXCLUDE[ticker]?.test(headline)) return 'company_promo';
  if (PROMO.test(headline) && !STRONG.test(headline)) return 'promo';
  if (!MATERIAL.test(headline)) return 'not_material';
  return null;
}

export function newsAllowed(ticker, aliases, title, description = '') {
  return newsRejectReason(ticker, aliases, title, description) === null;
}
