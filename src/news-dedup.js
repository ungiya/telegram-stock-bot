// 같은 사건을 다룬 다른 언론사 기사(보도자료 재가공 포함)를 하나로 묶는다.
// 회사·날짜별 예외 없이, 같은 종목의 최근 36시간 기사끼리만 비교한다.
// 36시간이 지나면 같은 주제라도 새 소식으로 본다 (과거 기사 때문에
// 새 뉴스가 막히는 문제를 막기 위함).
export const DEDUP_WINDOW_MS = 36 * 3600000;

const STOP = new Set(['기자', '뉴스', '단독', '속보', '종합', '사진', '제공', '통해', '위해', '위한', '이번', '지난',
  '올해', '내년', '국내', '해외', '글로벌', '관련', '밝혔다', '전했다', '예정', '계획', '추진', '본격', '강화', '확대',
  '기업', '회사', '대표', '발표', '공개', '진행', '시장', '사업', '업계', '최초', '세계', '한국', '미국', '오늘', '내일']);
const JOSA = /(?:으로서|으로써|에서는|에게서|으로|에서|에게|까지|부터|보다|처럼|과의|와의|이다|하고|하며|했다|한다|은|는|이|가|을|를|의|에|와|과|도|만|로)$/u;
const TURN = /정정|철회|취소|해지|무산|결렬|부인|사실\s*무근|중단|연기|재개/;

// 표기만 다른 같은 말을 맞춘다.
function unify(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/(?<=\d),(?=\d)/g, '')
    .replace(/\b([1-4])\s*q\b/g, '$1분기').replace(/영업익/g, '영업이익').replace(/순익/g, '순이익')
    .replace(/사상\s*최대|역대\s*최고|사상\s*최고/g, '역대 최대').replace(/(\d)\s*억\s*원/g, '$1억').replace(/(\d)\s*조\s*원/g, '$1조')
    .replace(/美/g, '미국').replace(/中/g, '중국').replace(/日/g, '일본').replace(/韓/g, '한국');
}
const EARNINGS = /실적|영업이익|매출|순이익|흑자|적자|어닝/;
function period(value) {
  const s = unify(value);
  return s.match(/[1-4]분기|상반기|하반기|연간|반기/)?.[0] || '';
}
function amounts(value) {
  return new Set([...unify(value).matchAll(/(\d+(?:\.\d+)?)(조|억)/g)].map(m => m[1] + m[2]));
}

function core(value, names) {
  let s = unify(value)
    .replace(/[[【〈<(][^\]】〉>)]{0,30}[\]】〉>)]/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ').replace(/\S+@\S+/g, ' ');
  for (const name of names) if (name) s = s.split(String(name).normalize('NFKC').toLowerCase()).join(' ');
  return s.replace(/[^\p{L}\p{N}%.]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
function bigrams(value) {
  const compact = value.replace(/\s/g, '');
  const set = new Set();
  for (let i = 0; i < compact.length - 1; i++) set.add(compact.slice(i, i + 2));
  return set;
}
function dice(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const x of a) if (b.has(x)) shared++;
  return 2 * shared / (a.size + b.size);
}
function tokens(value) {
  return new Set(value.split(' ').map(w => w.replace(JOSA, ''))
    .filter(w => w.length >= 2 && !/^[\d.%]+$/.test(w) && !STOP.has(w)));
}
// 금액·비율·분기 숫자. 서로 다른 숫자가 있으면 다른 소식일 가능성이 높다.
function figures(value) {
  const groups = new Map();
  const s = unify(value);
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(조|억|만\s*원|%|분기)/g)) {
    const unit = m[2].replace(/\s/g, '');
    if (!groups.has(unit)) groups.set(unit, new Set());
    groups.get(unit).add(m[1]);
  }
  return groups;
}
function figuresConflict(a, b) {
  const fa = figures(a), fb = figures(b);
  for (const [unit, values] of fa) {
    const other = fb.get(unit);
    if (other && ![...values].some(v => other.has(v))) return true;
  }
  return false;
}
const time = item => Number(item.pub_ms ?? item.publishedAt);

export function sameNews(a, b, names = []) {
  if (!a || !b || a.ticker !== b.ticker) return false;
  if (a.url && a.url === b.url) return true;
  const ta = time(a), tb = time(b);
  if (!Number.isFinite(ta) || !Number.isFinite(tb) || Math.abs(ta - tb) > DEDUP_WINDOW_MS) return false;
  const all = [a.ticker, ...names];
  const titleA = core(a.title, all), titleB = core(b.title, all);
  if (!titleA || !titleB) return false;
  if (titleA === titleB) return true;
  // "계약 체결" 다음의 "계약 해지"처럼 방향이 바뀐 소식은 새 뉴스다.
  if (TURN.test(a.title) !== TURN.test(b.title)) return false;
  // 같은 기간의 실적 기사는 언론사가 달라도 같은 소식 (실적 발표는 기간당 한 번)
  const pa = period(a.title), pb = period(b.title);
  if (EARNINGS.test(a.title) && EARNINGS.test(b.title) && pa && pa === pb && !/전망|예상|컨센서스|추정/.test(a.title + b.title)) return true;
  const leadA = core(a.description, all).slice(0, 160), leadB = core(b.description, all).slice(0, 160);
  const leadSim = Math.min(leadA.length, leadB.length) >= 40 ? dice(bigrams(leadA), bigrams(leadB)) : 0;
  if (figuresConflict(a.title, b.title) && leadSim < 0.7) return false;
  // 제목에 같은 금액(억·조)이 나오면 같은 소식
  const amountA = amounts(a.title), amountB = amounts(b.title);
  if ([...amountA].some(v => amountB.has(v))) return true;
  const titleSim = dice(bigrams(titleA), bigrams(titleB));
  const ka = tokens(titleA), kb = tokens(titleB);
  const shared = [...ka].filter(w => kb.has(w)).length;
  return titleSim >= 0.6
    || (shared >= 3 && titleSim >= 0.35)
    || (shared >= 2 && leadSim >= 0.45)
    || leadSim >= 0.65;
}
