// Ported from the existing Termux news filters.
const automatic = new RegExp("AI\\s*기자|인공지능\\s*기자|로봇\\s*기자|자동\\s*(생성|작성)|AI.{0,6}(작성한|생성한|작성된|생성된)\\s*기사|기업\\s*PR|보도자료를?\\s*(그대로|기반)|유료\\s*광고|협찬\\s*기사|본\\s*기사는?\\s*광고", "i");
const promotion = new RegExp("할인|쿠폰|기획전|타임딜|특가|쇼핑\\s*혜택|증정|사은품|구매\\s*혜택|프로모션|체험단|경품|선착순|팝업스토어|팝업\\s*스토어", "i");
const material = new RegExp("목표주가|투자의견|증권사\\s*리포트|기업\\s*분석|리서치|영업이익|순이익|잠정\\s*실적|분기\\s*실적|연간\\s*실적|실적\\s*발표|실적\\s*공시|수주|공급\\s*계약|수출\\s*계약|기술\\s*(수출|이전)|라이선스\\s*(아웃|계약)|임상|품목\\s*허가|FDA|인수합병|합병|지분\\s*인수|공장\\s*(증설|신설)|유상증자|전환사채|자사주|배당|횡령|배임|행정\\s*처분|소송|리콜|회생|파산|신약|신제품|신사업|특허|대표이사|상장\\s*(심사|예비|폐지)|투자\\s*유치", "i");
const market = new RegExp("주가|거래량|거래대금|상한가|하한가|급등|급락|상승률|하락률|특징주|장중|종목\\s*순위|수급|순매수|순매도|시황|주식\\s*시세|주식\\s*현재가|강세|약세", "i");
const business = new RegExp("매출|영업이익|순이익|분기\\s*실적|연간\\s*실적|실적\\s*(발표|공시)|인수합병|지분\\s*인수|자사주|배당|유상증자|전환사채|신작.{0,15}(출시|공개)|신규\\s*(게임|IP)|소송|행정\\s*처분", "i");
const tournament = new RegExp("게임\\s*대회|e[\\s-]*스포츠|이[\\s-]*스포츠|esports|프로\\s*리그|챔피언십|월드\\s*컵|국가\\s*대항전|결승|준결승|우승|준우승|조\\s*추첨|경기\\s*결과|선수\\s*(영입|이적)|\\b(?:PGC|PGS|PMGC|PMGO|PNC|PCS|PMPS|PWS)\\b", "i");
const game = new RegExp("배틀그라운드|PUBG|배그|게임|e[\\s-]*스포츠|이스포츠", "i");
const event = new RegExp("대회|리그|본선|예선|출전|개막|폐막|참가\\s*팀|경기\\s*일정|상금", "i");

export const norm = value => String(value).toLowerCase().replace(/[^\p{L}\p{N}_]/gu, "");
export function newsAllowed(ticker, aliases, title, description = "") {
  const text = title + " " + description;
  if (!aliases.some(alias => norm(title).includes(norm(alias)))) return false;
  if (automatic.test(text)) return false;
  if (promotion.test(title) && !material.test(title)) return false;
  if (market.test(title) && !material.test(text)) return false;
  if (ticker === "크래프톤") {
    if (business.test(title)) return true;
    if (tournament.test(title)) return false;
    if (game.test(text) && (event.test(title) || tournament.test(description))) return false;
  }
  return true;
}
