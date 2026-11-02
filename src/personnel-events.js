// Compare appointment stories by people and roles, not headline phrasing.
const appointment = /선임|임명|발탁|영입|보임|승진|신임|새\s*수장|사장단\s*인사|임원\s*인사/;
const changed = /사임|퇴임|퇴사|해임|철회|취소|정정|부인|소송|재선임|연임|추가\s*인사/;
const roles = '(?:총괄사장|대표이사|부회장|회장|부사장|사장|전무|상무|대표|최고경영자|CEO|CFO|CTO)';
function people(title) {
  const pairs = new Map();
  for (const m of String(title).matchAll(new RegExp('([가-힣]{2,4})\\s*(?:신임\\s*)?('+roles+')(?!단|급)','gi'))) {
    const name=m[1];
    if (!/^[김이박최정강조윤장임한오서신권황안송전홍유고문양손배백허남심노하곽성차주우구민류나진지엄채원천방공현변함]/.test(name)) continue;
    if (/^(신임|총괄|기존|신규|대표|최고|부문|담당|새로운)$/.test(name)) continue;
    const role=/^(CEO|최고경영자|대표이사|대표)$/i.test(m[2])?'대표이사':m[2].toLowerCase();
    pairs.set(name,role);
  }
  // "대표이사에 김철수 선임" is a common alternative ordering.
  for (const m of String(title).matchAll(new RegExp('('+roles+')\\s*에\\s*([가-힣]{2,4})(?=\\s|[,·…]|$)','gi'))) {
    const role=/^(CEO|최고경영자|대표이사|대표)$/i.test(m[1])?'대표이사':m[1].toLowerCase();pairs.set(m[2],role);
  }
  return pairs;
}
export function personnelRelation(a,b) {
  if (a.ticker!==b.ticker) return null;
  const at=String(a.title||''),bt=String(b.title||'');
  if (!appointment.test(at) || !appointment.test(bt)) return null;
  if (changed.test(at) || changed.test(bt)) return null;
  const ap=people(at),bp=people(bt);
  if (!ap.size || !bp.size) return null;
  // Different named people or roles must remain separate announcements.
  if (ap.size!==bp.size || [...ap].some(([name,role])=>bp.get(name)!==role)) return false;
  const ay=at.match(/20\d{2}/)?.[0],by=bt.match(/20\d{2}/)?.[0];
  if (ay && by && ay!==by) return false;
  const am=Number(a.pub_ms),bm=Number(b.pub_ms);
  // Annual appointments to the same role should not match a later cycle.
  if (!Number.isFinite(am)||!Number.isFinite(bm)||Math.abs(am-bm)>7*86400000) return null;
  return true;
}

// The user has already received this announced round of SK appointments.
export function reportedSkPersonnel(item) {
  if (String(item.ticker).toLowerCase()!=='sk이노베이션') return false;
  const t=String(item.title||''),d=String(item.description||'');
  const date=Number(item.pub_ms);
  if (!Number.isFinite(date)||date<Date.parse('2026-10-30T00:00:00+09:00')||date>=Date.parse('2026-11-14T00:00:00+09:00')) return false;
  if (!appointment.test(t)||changed.test(t)) return false;
  if (/실적|영업이익|매출|수주|공급\s*계약|투자\s*유치/.test(t)) return false;
  const year=t.match(/20\d{2}/)?.[0];if(year && year!=='2027') return false;
  const p=people(t);
  if (p.size) return [...p].every(([name,role])=>
    (name==='정승일' && role==='총괄사장') || (name==='강동수' && role==='사장'));
  // Round-wide headlines may omit names; require the actual year and names in the excerpt.
  return /2027/.test(t+' '+d) && /사장단\s*인사/.test(t) && /정승일/.test(d) && /강동수/.test(d);
}
