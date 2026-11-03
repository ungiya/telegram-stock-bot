// Identify a buyback announcement by its transaction amount, not annual total
// shareholder returns or outlet-specific wording. No extra network requests.
const norm = x => String(x || '').normalize('NFKC').replace(/(?<=\d),(?=\d)/g, '');
const stock = /자사주|자기\s*주식/;
const buying = /매입|취득|사들|사들이/;
const followup = /취소|철회|정정|변경|완료|종료|결과|추가|재개|중단|처분|매각|신탁/;
function announcement(item) {
  const title = norm(item.title), body = norm(item.description);
  if (!stock.test(title) || !buying.test(title) || followup.test(title)) return null;
  // A completed cancellation is a new milestone, unlike a plan to cancel.
  if (/소각(?:을|이)?\s*(?:완료|실시했|마쳤)/.test(body)) return null;
  const amount = value => {
    const candidates = [...value.matchAll(/(\d+(?:\.\d+)?)\s*(조|억)\s*원?/g)].filter(m => {
      const before=value.slice(Math.max(0,m.index-22),m.index);
      const after=value.slice(m.index+m[0].length,m.index+m[0].length+22);
      return !/주주\s*환원\s*$/.test(before) &&
        ((stock.test(before) && buying.test(before)) ||
         (stock.test(after) && buying.test(after)) ||
         (stock.test(before) && /^(?:\s*(?:규모|상당|어치))?\s*(?:매입|취득|소각)/.test(after)));
    });
    if (candidates.length !== 1) return null;
    const m=candidates[0];return Number(m[1])*(m[2]==='조'?10000:1);
  };
  const money=amount(title) ?? amount(body);
  const date=Number(item.pub_ms ?? item.publishedAt);
  if (money===null || !Number.isFinite(date)) return null;
  return {money,date};
}
export function buybackRelation(a,b) {
  if (a.ticker!==b.ticker) return null;
  const aa=announcement(a),bb=announcement(b);
  if (!aa || !bb) {
    // Preserve actual changes even if their text repeats the original plan.
    if (stock.test(norm(a.title)) && stock.test(norm(b.title)) &&
        (followup.test(norm(a.title)) || followup.test(norm(b.title)))) return false;
    return null;
  }
  if (Math.abs(aa.date-bb.date)>3*86400000) return false;
  return Math.abs(aa.money-bb.money)<=Math.max(0.1,aa.money*0.001);
}
// Screenshot confirms this specific announcement has already been delivered.
export function reportedKraftonBuyback(item) {
  if (item.ticker!=='크래프톤') return false;
  const a=announcement(item);
  return !!a && Math.abs(a.money-3000)<0.1 &&
    a.date>=Date.parse('2026-11-03T00:00:00+09:00') &&
    a.date<Date.parse('2026-11-07T00:00:00+09:00');
}
