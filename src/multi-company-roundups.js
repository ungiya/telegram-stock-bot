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

export function isMultiCompanyRoundup(title) {
  const headline=String(title||'').normalize('NFKC').trim();
  if(!headline) return false;
  const companies=companyNamesInTitle(headline);
  if(companies.size < 2) return false;
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
  return (isDigest && (companyList || multipleBullets)) ||
    (multipleBullets && companies.size >= 3);
}
