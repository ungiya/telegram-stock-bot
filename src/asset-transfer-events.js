// Conservative comparison of corporate asset / IP transfers.
// In syndicated coverage an asset purchase may be called an acquisition,
// assignment, transfer, repatriation, or return of rights.
const normalize = value => String(value || '').normalize('NFKC').toLowerCase();
function transfer(value) {
  return /이전|인수|회수|양수|양도|귀속|통합|확보|취득/.test(normalize(value));
}
function rights(value) {
  return /권리|지식\s*재산|지재권|소유권|특허|\bip\b|파이프라인|후보물질|신약|자산/.test(normalize(value));
}
function subsidiary(value) {
  return /자회사|계열사|뉴랄리|\bneuraly\b/.test(normalize(value));
}
function count(value) {
  const text = normalize(value);
  let m = text.match(/(\d+)\s*(?:개|종|건)\s*(?:의\s*)?(?:신약|파이프라인|후보물질|품목|자산|지식재산)/);
  if (!m) m = text.match(/(?:신약|파이프라인|후보물질|품목|자산|권리)\s*(?:등\s*)?(\d+)\s*(?:개|종|건)/);
  return m ? Number(m[1]) : null;
}
function amountInHundredMillions(value) {
  const text = normalize(value).replace(/,/g, '');
  const m = text.match(/(\d+(?:\.\d+)?)\s*(조|억)\s*(?:\d+(?:\.\d+)?\s*만)?\s*원?/);
  if (!m) return null;
  return Number(m[1]) * (m[2] === '조' ? 10000 : 1);
}
function changedDeal(value) {
  return /추가\s*(?:계약|이전|인수|양수|양도)|정정|해지|취소|철회|재계약|변경\s*계약|계약\s*변경/.test(normalize(value));
}
function counterparty(value) {
  const text = normalize(value);
  if (/뉴랄리|\bneuraly\b/.test(text)) return 'neuraly';
  return '';
}
// null: generic deduplication may decide; false: distinct event; true: same event.
export function assetTransferRelation(a, b) {
  if (a.ticker !== b.ticker) return null;
  const at = String(a.title || ''), bt = String(b.title || '');
  const aText = at + ' ' + String(a.description || '');
  const bText = bt + ' ' + String(b.description || '');
  if (!(transfer(at) && transfer(bt) && rights(at) && rights(bt)
      && subsidiary(aText) && subsidiary(bText))) return null;
  // A later corrective or additional transaction is a new event.
  if (changedDeal(at) || changedDeal(bt)) return null;
  const aPartner = counterparty(aText), bPartner = counterparty(bText);
  if (aPartner && bPartner && aPartner !== bPartner) return false;
  const ac = count(at) ?? count(a.description);
  const bc = count(bt) ?? count(b.description);
  if (ac !== null && bc !== null && ac !== bc) return false;
  const av = amountInHundredMillions(at) ?? amountInHundredMillions(a.description);
  const bv = amountInHundredMillions(bt) ?? amountInHundredMillions(b.description);
  if (av !== null && bv !== null && Math.abs(av - bv) > Math.max(0.5, 0.025 * Math.max(av, bv))) return false;
  // Require at least one hard identifying fact in both reports.
  const matchedCount = ac !== null && bc !== null && ac === bc;
  const matchedAmount = av !== null && bv !== null;
  return (matchedCount || matchedAmount) ? true : null;
}
