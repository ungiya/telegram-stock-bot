import { isMultiCompanyRoundup } from './multi-company-roundups.js';
// Ported from the existing Termux news filters.
const automatic = new RegExp("AI\\s*기자|인공지능\\s*기자|로봇\\s*기자|자동\\s*(생성|작성)|AI.{0,6}(작성한|생성한|작성된|생성된)\\s*기사|기업\\s*PR|보도자료를?\\s*(그대로|기반)|유료\\s*광고|협찬\\s*기사|본\\s*기사는?\\s*광고", "i");
const promotion = new RegExp("할인|쿠폰|기획전|타임딜|특가|쇼핑\\s*혜택|증정|사은품|구매\\s*혜택|프로모션|체험단|경품|선착순|팝업스토어|팝업\\s*스토어", "i");
const material = new RegExp("목표주가|투자의견|증권사\\s*리포트|기업\\s*분석|리서치|영업이익|순이익|잠정\\s*실적|분기\\s*실적|연간\\s*실적|실적\\s*발표|실적\\s*공시|수주|공급\\s*계약|수출\\s*계약|기술\\s*(수출|이전)|라이선스\\s*(아웃|계약)|임상|품목\\s*허가|FDA|인수합병|합병|지분\\s*인수|공장\\s*(증설|신설)|유상증자|전환사채|자사주|배당|횡령|배임|행정\\s*처분|소송|리콜|회생|파산|신약|신제품|신사업|특허|대표이사|상장\\s*(심사|예비|폐지)|투자\\s*유치", "i");
const market = new RegExp("주가|거래량|거래대금|상한가|하한가|급등|급락|상승률|하락률|특징주|장중|종목\\s*순위|수급|순매수|순매도|시황|주식\\s*시세|주식\\s*현재가|강세|약세", "i");
const business = new RegExp("매출|영업이익|순이익|분기\\s*실적|연간\\s*실적|실적\\s*(발표|공시)|인수합병|지분\\s*인수|자사주|배당|유상증자|전환사채|신작.{0,15}(출시|공개)|신규\\s*(게임|IP)|소송|행정\\s*처분", "i");
const tournament = new RegExp("게임\\s*대회|e[\\s-]*스포츠|이[\\s-]*스포츠|esports|프로\\s*리그|챔피언십|월드\\s*컵|국가\\s*대항전|결승|준결승|우승|준우승|조\\s*추첨|경기\\s*결과|선수\\s*(영입|이적)|\\b(?:PGC|PGS|PMGC|PMGO|PNC|PCS|PMPS|PWS)\\b", "i");
const game = new RegExp("배틀그라운드|PUBG|배그|게임|e[\\s-]*스포츠|이스포츠", "i");
const event = new RegExp("대회|리그|본선|예선|출전|개막|폐막|참가\\s*팀|경기\\s*일정|상금", "i");

// Musinsa is an IPO/investment watch, NOT a fashion shopping or staffing feed.
// In particular, designer/CD hiring must never be rescued by references to IPO,
// sales, overseas expansion or business growth within the same headline.
const musinsaFashionHeadline = /디자이너|크리에이티브\s*디렉터|creative\s*director|\bcd\b|아트\s*디렉터|김지용|지용킴|jiyong\s*kim|룩북|화보|스타일링|코디|패션쇼|런웨이|컬렉션|착장|스트릿\s*패션|스트리트\s*패션|신상품|신제품|신상|신규\s*상품|쇼핑\s*(?:추천|혜택|트렌드)|쇼핑몰|기획전|할인|쿠폰|세일|특가|무진장|타임딜|사은품|증정|팝업|프로모션|콜라보|협업\s*(?:상품|컬렉션|라인)|브랜드\s*(?:출시|론칭|런칭|입점|영입|협업|콜라보|팝업|매출)|상품\s*(?:출시|공개|입점|판매)|의류|코트|아우터|패딩|스니커즈|운동화|팬츠|니트|데님|티셔츠|맨투맨|후드|가을옷|겨울옷|유행\s*아이템/i;
const musinsaTalentAnnouncement = /(?:인재|인물|인사|전문가|크리에이터|디자이너|디렉터|스타일리스트|김지용|지용킴).{0,30}(?:영입|선임|발탁|합류|임명|사임|퇴임|해임)|(?:영입|선임|발탁|합류|임명).{0,30}(?:디자이너|디렉터|스타일리스트|김지용|지용킴)|(?:신임|새)\s*(?:디자이너|디렉터)/i;
const musinsaInvestmentNews = /기업\s*공개|\bipo\b|상장|예비\s*심사|심사\s*청구|공모\s*(?:가|주|청약)|기업\s*가치|증권\s*신고서|상장\s*주관사|투자\s*유치|자금\s*조달|시리즈\s*[a-z]|유상\s*증자|무상\s*증자|전환\s*사채|회사채|지분\s*(?:인수|매각|투자)|인수\s*합병|\bm&a\b|경영권|최대\s*주주|자사주|배당|대표\s*이사|신임\s*대표|구조\s*조정|사업\s*(?:재편|매각|인수)|횡령|배임|소송|과징금|행정\s*처분|회생|파산|감사\s*의견|재무\s*제표|분기\s*실적|연간\s*실적|연결\s*실적|실적\s*(?:발표|공시)|영업\s*이익|당기\s*순이익|순이익|적자\s*전환|흑자\s*전환|해외\s*(?:진출|사업)/i;
const musinsaFinancialResults = /(?:매출|거래액).{0,20}(?:\d|전년|분기|영업\s*이익|순이익|급증|증가|감소|실적)|(?:분기|연간|연결|전년|지난해|작년|올해).{0,20}(?:매출|거래액|실적)/i;
const musinsaRetailActivity = /(?:패션|브랜드|스토어|매장|무신사\s*스탠다드|무신사\s*뷰티).{0,28}(?:출시|런칭|론칭|영입|발탁|선임|오픈|개점|입점|팝업|쇼핑|판매|공개|컬렉션|대전|기획전|행사|콜라보|협업)|(?:출시|런칭|론칭|입점|팝업|컬렉션|화보|영입|선임).{0,25}(?:패션|브랜드|스토어|매장|무신사\s*스탠다드|무신사\s*뷰티)/i;

// Wadiz is tracked for its own corporate developments, NOT as a
// marketplace feed of campaigns, makers, products or funding participation.
// Do not use excerpt keywords to rescue a consumer-project headline.
const wadizCorporateSubject = /^(?:\[[^\]]{0,40}\]\s*)?(?:크라우드\s*펀딩\s*플랫폼\s*)?와디즈(?=\s|[,，.…·"'“‘(]|[는가의측]|$)/i;
const wadizMakerLead = /^(?:\[[^\]]{0,40}\]\s*)?와디즈(?:서|에서|를?\s*통해|\s*(?:프로젝트|펀딩|메이커|입점|서포터|리워드))/i;
const wadizCampaign = /겨울|여름|난방|가전|패션|뷰티|화장품|식품|여행|캠핑|선물|생활용품|반려동물|리워드|서포터|메이커|프로젝트|신제품|인기\s*(?:상품|펀딩)|상품\s*(?:출시|판매)|펀딩\s*(?:참여|프로젝트|성공|오픈|진행|달성|모금|추천)|(?:참여|후원)\s*(?:자|율|증가)|기획전|쇼핑|쿠폰|할인|특가|프로모션|시즌|트렌드|카테고리|판매\s*량|브랜드\s*런칭/i;
const wadizCapital = /기업\s*공개|\bipo\b|상장(?:\s*예비)?\s*(?:심사|청구|추진|계획|준비|승인|철회|폐지)|상장\s*주관사|증권\s*신고서|공모\s*(?:가|주|청약)|투자\s*유치|자금\s*조달|시리즈\s*[a-f]\b|유상\s*증자|무상\s*증자|전환\s*사채|회사채|지분\s*(?:인수|매각)|인수\s*합병|\bm&a\b|경영권|최대\s*주주|자사주|배당/i;
const wadizFinancial = /(?:분기|연간|연결|잠정|지난해|올해|전년\s*동기).{0,24}(?:실적|매출(?:액)?|영업\s*이익|영업\s*손실|순이익|거래액)|(?:영업\s*이익|영업\s*손실|당기\s*순이익|순이익|영업손익|회사\s*매출|연결\s*매출|플랫폼\s*거래액).{0,22}(?:\d|증가|감소|기록|발표|공시|흑자|적자|돌파|달성)|(?:흑자|적자)\s*전환|재무\s*제표|감사\s*의견|기업\s*가치|기업\s*밸류에이션/i;
const wadizGovernance = /(?:대표\s*이사|최고\s*경영자|\bceo\b|신임\s*대표).{0,16}(?:선임|사임|교체|취임|해임)|(?:선임|사임|교체|취임|해임).{0,16}(?:대표\s*이사|최고\s*경영자|\bceo\b)|구조\s*조정|사업\s*(?:재편|매각|인수)|자회사\s*(?:설립|매각)|횡령|배임|소송|과징금|행정\s*처분|회생|파산|법정\s*관리|회계\s*감리/i;
const wadizContract = /(?:신규\s*사업|신사업)\s*(?:진출|출범|인수)|(?:해외|현지)\s*법인\s*(?:설립|신설)|(?:공급|수출)\s*계약\s*(?:체결|수주)|(?:대규모|전략적)\s*(?:사업\s*)?(?:인수|합병)/i;
export function wadizCompanyNewsAllowed(title) {
  const headline = String(title || '').normalize('NFKC').trim();
  if (!wadizCorporateSubject.test(headline) || wadizMakerLead.test(headline)) return false;
  const finance = wadizFinancial.test(headline);
  if (!(finance || wadizCapital.test(headline) || wadizGovernance.test(headline) || wadizContract.test(headline))) return false;
  // A maker's product/project story can mention IPO and company results in
  // passing. Such consumer-news headlines are always excluded here.
  if (wadizCampaign.test(headline)) return false;
  return true;
}

export function companyNewsAllowed(ticker, title, description = '') {
  const company = String(ticker).normalize('NFKC').toLowerCase().replace(/\s/g, '');
  if (['ls일렉트릭', 'lselectric', '엘에스일렉트릭'].includes(company)) {
    const headline = String(title || '').normalize('NFKC');
    const text = headline + ' ' + String(description || '').normalize('NFKC');
    // Reworded chairman publicity is excluded regardless of outlet, date or URL.
    // Concrete new corporate events remain eligible, even with a background quote.
    const concrete = /수주|공급\s*계약|수출\s*계약|계약\s*체결|잠정\s*실적|분기\s*실적|실적\s*(?:발표|공시)|영업\s*이익|순이익|공장.{0,12}(?:증설|신설|준공|착공)|신제품\s*출시|인수\s*합병|지분\s*인수|자사주|배당|소송|리콜|행정\s*처분/.test(headline);
    if (/구\s*자\s*균/.test(text) && !concrete) return false;
  }
  if (ticker === '와디즈') return wadizCompanyNewsAllowed(title);
  if (ticker !== '무신사') return true;
  const headline = String(title || '');
  const excerpt = String(description || '');
  // Block designer stories regardless of misleading corporate keywords.
  if (musinsaFashionHeadline.test(headline) || musinsaTalentAnnouncement.test(headline) ||
      musinsaRetailActivity.test(headline)) return false;
  // A vague '무신사, 새로운 도약' heading about designer hiring is still fashion.
  const material = musinsaInvestmentNews.test(headline) || musinsaFinancialResults.test(headline);
  if (!material) return false;
  if (/디자이너|크리에이티브\s*디렉터|creative\s*director|김지용|지용킴|jiyong\s*kim/i.test(excerpt) &&
      /영입|발탁|선임|임명|합류|크리에이티브|디자인\s*총괄|패션\s*조직/i.test(excerpt) &&
      !/기업\s*공개|\bipo\b|상장\s*예비\s*심사|심사\s*청구|영업\s*이익|분기\s*실적|연결\s*실적|인수\s*합병|투자\s*유치/i.test(headline))
    return false;
  return true;
}

// Exclude securities-firm price targets, rating changes and analyst commentary
// from NEWS alerts only. Independently scheduled broker reports are unaffected.
const analystTargetPrice = /목표\s*(?:주가|가(?:격)?|價)|적정\s*주가|\btarget\s*price\b/i;
const analystRating = /투자\s*(?:의견|등급)|(?:매수|매도|중립|비중\s*(?:확대|축소))\s*(?:의견|추천|유지|제시|상향|하향|전환)/i;
const analystSource = /증권사|증권가|애널리스트|리서치|증권\s*리포트|[가-힣a-z]{2,16}\s*증권(?=\s|[,·:'"“”]|$|[이가은는의에서도과와]|으로)/i;
const analystCommentary = /전망|추정|평가|분석|추천|매수|매도|중립|비중\s*(?:확대|축소)|상승\s*여력|하락\s*여력|밸류에이션|투자\s*매력|눈높이|어닝\s*서프라이즈\s*기대/i;
const opinionHeadline = /전망|기대|추천|분석|평가|눈높이|주가|매수|매도|투자\s*매력|상승\s*여력|하락\s*여력|증권가|증권사|리포트/i;

export function analystNewsExcluded(title, description = '') {
  const headline = String(title || '');
  if (analystTargetPrice.test(headline) || analystRating.test(headline)) return true;
  if (analystSource.test(headline) && analystCommentary.test(headline)) return true;
  // A corporate event may mention a price target in background copy; only
  // exclude excerpt-sourced analyst coverage when the headline is an opinion.
  const excerpt = String(description || '');
  return opinionHeadline.test(headline) && analystSource.test(excerpt) &&
    (analystTargetPrice.test(excerpt) || analystRating.test(excerpt));
}

// APR news is monitored for material business developments, not repeated
// brand publicity. Headline-only matching prevents an incidental sales figure
// in a promotional excerpt from bypassing the advertising filter.
export function promotionalNewsExcluded(ticker, title, description = '') {
  if (ticker !== '에이피알') return false;
  const headline = String(title || '').normalize('NFKC');
  const advertising = /홍보|광고|캠페인|앰버서더|홍보대사|브랜드\s*(?:모델|영상|행사|체험|스토리)|인플루언서|크리에이터|셀럽|팬\s*미팅|체험단|뷰티\s*(?:클래스|체험|이벤트|박람회)|팝업|기획전|할인|쿠폰|프로모션|라이브\s*커머스|언박싱|화보|콜라보|협업\s*컬렉션|어워즈|수상|인기\s*(?:브랜드|상품)|완판|품절|베스트셀러|랭킹|순위|화제|호평|선정|성료|1위|첫\s*방송|유튜브|sns|틱톡|인스타그램|k[\s-]*뷰티\s*(?:열풍|인기)/i;
  // The title may be a multi-company roundup ('에이피알, 아모레퍼시픽...')
  // while the Naver excerpt is solely an APR popup/brand PR item.
  const snippet = String(description || '').normalize('NFKC');
  const aprPopup = /(?:에이피알|메디큐브).{0,140}(?:팝업|웰니스\s*클럽|릴레이\s*(?:행사|팝업)|(?:1만\s*5천|15[,.]?000|1만5000).{0,25}(?:명|방문|몰려))|(?:팝업|웰니스\s*클럽).{0,100}(?:에이피알|메디큐브)/i.test(snippet);
  const roundup = /똑똑한케어|(?:에이피알.{0,25}아모레퍼시픽)|(?:에이피알.{0,40}애경산업)|(?:에이피알.{0,40}더파운더즈)|오늘의\s*(?:뷰티|화장품)\s*뉴스/i.test(headline);
  if (!advertising.test(headline) && !(roundup && aprPopup)) return false;
  // Preserve objectively material news even when the headline also says
  // "campaign" or "ranking" in passing; don't rescue vague hype in an excerpt.
  const hardEvent = /(?:분기|연간|연결|잠정)\s*(?:실적|매출)|(?:실적|영업이익|순이익|영업손익|당기순이익)\s*(?:발표|공시|증가|감소|흑자|적자)|매출\s*\d[\d,.]*\s*(?:조|억|만)\s*원|(?:영업\s*이익|순\s*이익|당기순이익)\s*[\d,.]+\s*(?:조|억|만)\s*원|(?:수주|납품|공급)\s*계약|계약\s*체결|투자\s*유치|유상증자|무상증자|자사주|배당|인수합병|지분\s*인수|공장.{0,12}(?:증설|신설|착공|준공)|(?:새|신규|신)\s*(?:제품|기기|디바이스|서비스)\s*(?:출시|개발|공개)|(?:신제품|신기기|신사업)\s*(?:출시|공개|진출|개발)|(?:해외|현지)\s*(?:법인|공장)\s*(?:설립|신설)|(?:fda|식약처|ce)\s*(?:허가|승인)|특허\s*(?:등록|취득)|소송|행정\s*처분|리콜|대표이사\s*(?:사임|선임)|(?:새|신규)\s*국가\s*(?:진출|출시)/i;
  return !hardEvent.test(headline);
}

// Price-movement stories remain excluded even when their background mentions earnings.
export function priceNewsExcluded(title) {
  const headline = String(title || '').normalize('NFKC');
  if (/특징주|상한가|하한가|신고가|신저가|주가.{0,30}(?:상승|하락|급등|급락|강세|약세|오름|내림|반등|하락세|상승세)|\d+(?:[.]\d+)?\s*%.{0,8}(?:상승|하락|급등|급락|↑|↓)|(?:상승|하락|급등|급락).{0,8}\d+(?:[.]\d+)?\s*%/.test(headline)) return true;
  return market.test(headline) && !material.test(headline);
}

export const norm = value => String(value).toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "");
export function newsAllowed(ticker, aliases, title, description = "") {
  // Publisher news roundups containing several companies are never one
  // company-specific alert. This holds even if the description quotes a
  // material development at the selected ticker.
  if (isMultiCompanyRoundup(title)) return false;
  const text = title + " " + description;
  if (!aliases.some(alias => norm(title).includes(norm(alias)))) return false;
  if (automatic.test(text)) return false;
  if (promotionalNewsExcluded(ticker, title, description)) return false;
  if (analystNewsExcluded(title, description)) return false;
  if (!companyNewsAllowed(ticker, title, description)) return false;
  if (promotion.test(title) && !material.test(title)) return false;
  if (priceNewsExcluded(title)) return false;
  if (ticker === "크래프톤") {
    if (business.test(title)) return true;
    if (tournament.test(title)) return false;
    if (game.test(text) && (event.test(title) || tournament.test(description))) return false;
  }
  return true;
}
