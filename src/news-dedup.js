// Compare recent stories locally, without paid services or extra HTTP requests.
function text(value, ticker) {
  let result = String(value || '').normalize('NFKC').toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ').replace(/\S+@\S+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ');
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
    .filter(word => word.length >= 2 && !/^(단독|기자|뉴스|협력|공략|추진|발표|체결)$/.test(word)));
}
export function sameNews(a, b) {
  if (a.ticker !== b.ticker) return false;
  const at = text(a.title, a.ticker), bt = text(b.title, b.ticker);
  if (!at || !bt) return false;
  // Different amounts, quarters or dates in headlines can mean a material update.
  const an = [...at.matchAll(/\d+(?:\.\d+)?/g)].map(m => m[0]).sort().join(',');
  const bn = [...bt.matchAll(/\d+(?:\.\d+)?/g)].map(m => m[0]).sort().join(',');
  if (an && bn && an !== bn) return false;
  if (at === bt) return true;
  const titleSimilarity = overlap(grams(at), grams(bt));
  if (Math.min(at.length, bt.length) >= 12 && titleSimilarity >= 0.87) return true;
  const ad = text(a.description, a.ticker), bd = text(b.description, b.ticker);
  if (Math.min(ad.length, bd.length) < 35) return false;
  const summarySimilarity = overlap(grams(ad.slice(0, 400)), grams(bd.slice(0, 400)));
  const ak = keywords(at), bk = keywords(bt);
  const shared = [...ak].filter(word => bk.has(word)).length;
  return (titleSimilarity >= 0.62 && summarySimilarity >= 0.5)
    || (shared >= 3 && titleSimilarity >= 0.32 && summarySimilarity >= 0.48);
}
