// Compare recent stories locally, without paid services or extra HTTP requests.
function text(value, ticker) {
  let result = String(value || '').normalize('NFKC').toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ').replace(/\S+@\S+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
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
  return (titleSimilarity >= 0.62 && summarySimilarity >= 0.5)
    || (shared >= 3 && titleSimilarity >= 0.32 && summarySimilarity >= 0.48)
    || (shared >= 2 && titleSimilarity >= 0.28 && summarySimilarity >= 0.72)
    || (shared >= 2 && titleSimilarity >= 0.55 && summarySimilarity >= 0.6)
    || (shared >= 1 && titleSimilarity >= 0.3 && Math.min(ad.length,bd.length) >= 40 && summarySimilarity >= 0.9);
}

// The user confirmed repeated delivery of this specific 2026-10-30 GSPA.
// Suppress its syndicated coverage even when the original has aged out of
// history or a publisher supplies a completely different/empty excerpt.
// Date bounds and follow-up exclusions prevent a permanent Siemens blacklist.
export function coveredNewsEvent(item) {
  if (item.ticker !== '효성중공업') return null;
  const published = Number(item.pub_ms);
  if (!Number.isFinite(published) || published < Date.parse('2026-10-29T00:00:00+09:00')
    || published >= Date.parse('2026-11-14T00:00:00+09:00')) return null;
  const title = String(item.title || '').normalize('NFKC').toLowerCase();
  const body = title + ' ' + String(item.description || '').normalize('NFKC').toLowerCase();
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
