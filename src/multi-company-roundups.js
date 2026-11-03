import { ALIASES } from './watchlist.js';

// Publisher "game briefing", "industry roundup", and "today's company news"
// articles mix announcements from unrelated businesses in one headline.
// The Naver excerpt often covers ANOTHER company, so treating a roundup as
// company-specific creates noisy reposts and can misattribute material facts.
// This rule applies to every watchlist ticker, regardless of publisher or date.
const topicHeader = /(?:브리핑|게임\s*월드|게임월드|업계\s*(?:소식|동향|뉴스)|산업\s*(?:소식|동향|뉴스)|기업\s*(?:소식|동향|뉴스)|(?:오늘|금주|주간)의\s*(?:(?:게임|바이오|제약|산업|시장|기업|증시)\s*)?(?:뉴스|이슈|소식)|(?:한눈에|모아보기|모아본|뉴스\s*모음|주요\s*소식)|(?:마켓|비즈|산업)\s*인사이드)/i;
const splitBulletin = /[·ㆍ,，|/]|(?:\s+[×xX]\s+)|(?:\s*[-–—]\s*)/;
// Widely-covered companies need not all be on the user's watchlist.
const otherNames = [
  '컴투스','카카오게임즈','넥슨','넥슨게임즈','위메이드','스마일게이트',
  '펄어비스','엔씨','nc ai','ncai','nhn','넷이즈','라이온하트',
  '삼성전자','sk하이닉스','lg에너지솔루션','현대차','기아',
  '셀트리온','유한양행','한미약품','삼성바이오로직스',
  '두산에너빌리티','포스코홀딩스','한화에어로스페이스',
  '아모레퍼시픽','애경산업','cj제일제당'
];
const allNames=[...new Set([...Object.keys(ALIASES),...Object.values(ALIASES).flat(),...otherNames]
  .map(x=>x.toLowerCase().replace(/\s+/g,' ')))].sort((a,b)=>b.length-a.length);

function companyNamesInTitle(value) {
  let text=String(value||'').normalize('NFKC').toLowerCase();
  const matches=[];
  for(const name of allNames) {
    if (!name || !text.includes(name)) continue;
    matches.push(name);
    // Avoid counting a name that is part of a longer one (e.g. 엔씨 vs 엔씨소프트).
    text=text.split(name).join(' ');
  }
  return new Set(matches);
}

function multiCompanyList(afterHeader) {
  // Catch new/unlisted publishers and companies without maintaining an
  // exhaustive list of business names. Stop at the first full sentence;
  // a standalone story may mention other companies in background copy.
  const lead=String(afterHeader||'').split(/[.!?…。]/,1)[0].slice(0,160);
  const parts=lead.split(splitBulletin).map(x=>x.trim()).filter(Boolean);
  // A comma after one company often introduces an ordinary sentence.
  // Unknown-company lists require middle dots or at least three entries.
  if(!/[·ㆍ]/.test(lead) && parts.length<3) return false;
  const organization=part => part.length>=2 && part.length<=23 &&
    !/^(?:에서|부터|때문|위해|관련|현장)/.test(part) &&
    !/(?:공개|발표|신작|시연|출시|전망|협업|체결|실적|수주|상승|하락|제공|진출|개최|운영|확대|참가|프리뷰|프로그램|체험|공략|투자|계약|화제)/.test(part) &&
    part.split(/\s+/).length<=3;
  return parts.length>=2 && organization(parts[0]) && organization(parts[1]);
}

export function isMultiCompanyRoundup(title) {
  const headline=String(title||'').normalize('NFKC').trim();
  if(!headline) return false;
  const companies=companyNamesInTitle(headline);
  if(companies.size < 1) return false;
  const knownTickers=[...Object.keys(ALIASES)].sort((a,b)=>b.length-a.length);
  // Telegram/legacy senders may prepend "[ticker]" before the source title.
  const withoutTicker=headline.replace(/^\[([^\]]+)\]\s*/, (all,label) =>
    knownTickers.includes(label) ? '' : all);
  const header=withoutTicker.match(/^\s*(?:\[[^\]]{2,60}\]|【[^】]{2,60}】|〈[^〉]{2,60}〉)/u);
  const editorialPrefix=header?.[0] || withoutTicker.slice(0,55);
  const isDigest=topicHeader.test(editorialPrefix);
  // Distinguish an editorial digest from a single article comparing companies.
  const afterHeader=header ? withoutTicker.slice(header[0].length).trim() : withoutTicker;
  const companyList=splitBulletin.test(afterHeader);
  const multipleBullets=(headline.match(/[▲■◆◇▶●]/g)||[]).length>=2;
  // Strongly grounded: either multiple recognizable companies OR an
  // editorial list of plausible company names (including future companies).
  return (isDigest && ((companies.size>=2 && companyList) || multiCompanyList(afterHeader))) ||
    (multipleBullets && companies.size >= 3);
}
