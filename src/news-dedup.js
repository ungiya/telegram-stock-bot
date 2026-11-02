// Compare recent stories locally, without paid services or extra HTTP requests.
function text(value, ticker) {
  let result = String(value || '').normalize('NFKC').toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ').replace(/\S+@\S+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/pharma\s*research\s+global\s+symposium|\bpgs\b|글로벌\s*심포지[엄움]/gi, '글로벌심포지엄')
    .replace(/ls\s*(?:일렉트릭|electric)/g, 'ls일렉트릭')
    .replace(/직류\s*\(\s*dc\s*\)|\bdc\b/g, '직류')
    .replace(/인공지능/g, 'ai').replace(/데이터\s*센터/g, '데이터센터')
    .replace(/업무\s*협약|전략적\s*파트너십|파트너십|맞손|손잡(?:았다|는다|고|아)|협력/g, '협약');
  if (ticker) result = result.split(ticker.toLowerCase()).join(' ');
  return result.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function grams(value) {
  const compact = value.replace(/\s/g, '');
  return new Set(Array.from({ length: Math.max(0, compact.length - 1) }, (_, i) => compact.slice(i, i + 2)));
}
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let count = 0;
  for (const word of a) if (b.has(word)) count++;
  return 2 * count / (a.size + b.size);
}
function keywords(value) {
  return new Set(value.split(' ').map(word => word.replace(/(으로|에서|과|와|의|은|는|이|가|을|를)$/u, ''))
    .filter(word => word.length >= 2 && !/^\d+$/.test(word) && !/^(단독|기자|뉴스|협약|공략|추진|발표|체결|공급계약|계약|공급)$/.test(word)));
}
// Compare numbers within their meaning, rather than treating an incidental day
// in one headline and an amount in the other as conflicting facts.
function facts(value) {
  const groups = new Map();
  const s = String(value || '').normalize('NFKC').replace(/(?<=\d),(?=\d)/g, '');
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(조\s*원|억\s*원|만\s*원|원|%|분기|년|월)/g)) {
    const unit = m[2].replace(/\s/g, '');
    let number = Number(m[1]), category = unit;
    if (unit.endsWith('원')) {
      number *= ({'조원':1e12,'억원':1e8,'만원':1e4,'원':1})[unit]; category = 'amount';
    }
    if (!groups.has(category)) groups.set(category, new Set());
    groups.get(category).add(number);
  }
  return groups;
}
function conflictingFacts(a, b) {
  const af = facts(a), bf = facts(b);
  for (const [unit, numbers] of af) {
    const other = bf.get(unit);
    if (other && ![...numbers].some(n => other.has(n))) return true;
  }
  return false;
}
function eventFlags(value) {
  return [ /해지|철회|취소|중단|결렬/, /적자\s*전환|적자전환/, /흑자\s*전환|흑자전환/, /부인|사실무근/, /정정/ ]
    .map(pattern => pattern.test(value));
}
export function sameNews(a, b) {
  if (a.ticker !== b.ticker) return false;
  const at = text(a.title, a.ticker), bt = text(b.title, b.ticker);
  if (!at || !bt) return false;
  if (conflictingFacts(a.title, b.title)) return false;
  const aFlags = eventFlags(a.title), bFlags = eventFlags(b.title);
  if (aFlags.some((flag, i) => flag !== bFlags[i])) return false;
  if (conflictingFacts(a.description, b.description)) return false;
  if (at === bt) return true;
  const titleSimilarity = overlap(grams(at), grams(bt));
  const ad = text(a.description, a.ticker), bd = text(b.description, b.ticker);
  if (Math.min(at.length, bt.length) >= 12 && titleSimilarity >= 0.87) return true;
  if (Math.min(ad.length, bd.length) < 25) return false;
  const summarySimilarity = overlap(grams(ad.slice(0, 400)), grams(bd.slice(0, 400)));
  const ak = keywords(at), bk = keywords(bt);
  const shared = [...ak].filter(word => bk.has(word)).length;
  // Different outlets frequently paraphrase the headline and publish unrelated boilerplate excerpts.
  // Require multiple shared informative headline anchors before ignoring excerpt divergence.
  if (shared >= 2 && Math.min(at.length, bt.length) >= 18 && titleSimilarity >= 0.74) return true;
  return (titleSimilarity >= 0.62 && summarySimilarity >= 0.5)
    || (shared >= 3 && titleSimilarity >= 0.32 && summarySimilarity >= 0.48)
    || (shared >= 2 && titleSimilarity >= 0.28 && summarySimilarity >= 0.72)
    || (shared >= 2 && titleSimilarity >= 0.55 && summarySimilarity >= 0.6)
    || (shared >= 1 && titleSimilarity >= 0.3 && Math.min(ad.length,bd.length) >= 40 && summarySimilarity >= 0.9);
}

// The user confirmed repeated delivery of these specific 2026-10-30 events.
// Suppress its syndicated coverage even when the original has aged out of
// history or a publisher supplies a completely different/empty excerpt.
// Date bounds and follow-up exclusions prevent permanent company/person blacklists.
export function coveredNewsEvent(item) {
  // This immutable URL was explicitly reported as already received.
  try {
    const url = new URL(item.url);
    if (/^(?:www\.)?viva100\.com$/.test(url.hostname) && url.pathname === '/article/20261102500194')
      return 'event:ls-electric-koo-ai-dc-grid-2026-11-02';
  } catch { /* Fixtures and non-URL items still use content matching below. */ }
  const published = Number(item.pub_ms);
  if (!Number.isFinite(published) || published < Date.parse('2026-10-29T00:00:00+09:00')
    || published >= Date.parse('2026-11-14T00:00:00+09:00')) return null;
  const title = String(item.title || '').normalize('NFKC').toLowerCase();
  const body = title + ' ' + String(item.description || '').normalize('NFKC').toLowerCase();
  if (item.ticker === 'LS일렉트릭') {
    const speaker = /구자균/.test(body);
    const ai = /인공지능|\bai\b/.test(body);
    const dc = /직류|\bdc\b/.test(body);
    const grid = /전력망|전력난|전력\s*수요|전력\s*인프라/.test(body);
    const speech = /해법|강조|제언|제시|발언|필요|구축|지능형/.test(body);
    const followup = /수주|공급\s*계약|계약\s*체결|신제품|출시|준공|착공|실적|영업이익|매출|목표주가|투자의견|정정|철회|취소|소송|해임|사임/.test(title);
    return speaker && ai && dc && grid && speech && !followup
      ? 'event:ls-electric-koo-ai-dc-grid-2026-11-02' : null;
  }
  if (item.ticker === '파마리서치') {
    const pgs = /\bpgs\b|pharma\s*research\s+global\s+symposium|글로벌\s*심포지[엄움]/.test(body)
      || (/심포지[엄움]/.test(body) && /강릉|라카이|샌드파인/.test(body));
    // PGS in a background paragraph must not suppress genuinely new financial,
    // regulatory, clinical, product or analyst developments in the headline.
    const followup = /영업이익|순이익|실적|매출|목표\s*주가|투자\s*의견|매수|매도|증권|리포트|임상\s*[123]\s*상|임상\s*(결과|성공|실패)|유효성|품목\s*허가|승인|fda|수주|공급\s*계약|기술\s*(이전|수출)|인수|합병|출시|신제품|소송|취소|중단|정정/.test(title);
    // Do not merge a different year's/edition's symposium into the known event.
    const anotherYear = /20\d{2}/.test(title) && !/2026/.test(title);
    const anotherEdition = /제\s*\d+\s*회/.test(title) && !/제\s*7\s*회/.test(title);
    return pgs && !followup && !anotherYear && !anotherEdition
      ? 'event:pharmaresearch-pgs-2026-10' : null;
  }
  if (item.ticker === '무신사') {
    const person = /김지용|지용킴|jiyong\s*kim/.test(body);
    const appointment = /선임|영입|발탁|임명|합류|품(?:은|었다|다)|새\s*(?:디렉터|cd)/.test(body);
    const role = /크리에이티브\s*디렉터|creative\s*director|\bcd\b/.test(body);
    // Keep new appointments to other roles, departures and actual product launches.
    const followup = /사임|해임|퇴임|퇴사|결별|철회|취소|부인|정정|소송|보직\s*(?:변경|이동)|전보|승진|재선임|대표이사|신임\s*대표|사장|cfo|cto|출시|출점|개점|실적|매출|영업이익|첫\s*컬렉션/.test(title);
    if (person && appointment && !followup && (role || /김지용|지용킴|jiyong\s*kim/.test(title)))
      return 'event:musinsa-jiyongkim-cd-2026-10-30';
    return null;
  }
  if (item.ticker !== '효성중공업') return null;
  if (!/지멘스|siemens/.test(body)) return null;
  // Concrete follow-ups must not be swallowed by the old agreement coverage.
  if (/해지|철회|취소|중단|결렬|부인|사실무근|정정|소송|실적|영업이익|순이익|수주|공급\s*계약|납품|추가\s*(협약|계약)|신규\s*계약|재계약/.test(title)) return null;
  if (/해지|철회|취소|결렬|소송|사실무근/.test(body)) return null;
  if (/\d[\d,.]*\s*(?:조|억|만)\s*원/.test(title)) return null;
  const partnership = /협력|협약|파트너십|맞손|손잡|gspa|제휴|동맹/.test(body)
    || /(?:지멘스|siemens)\s*(?:와|과)/.test(title);
  const scope = /디지털\s*전력|전력망|데이터\s*센터|gspa/.test(body);
  return partnership && scope ? 'event:hyosung-siemens-gspa-2026-10-30' : null;
}
