// Conservative cross-publisher clinical-news deduplication.
// null means the general news similarity classifier should decide.
function normalized(value) {
  return String(value || '').normalize('NFKC').toLowerCase();
}
function codes(value) {
  const found = [...normalized(value).matchAll(/\b[a-z]{2,6}[\s-]?\d{2,5}[a-z]?\b/g)]
    .map(m => m[0].replace(/[\s-]/g, ''))
    .filter(v => !/^(?:glp1|phase\d+|iso\d+|kospi\d+|covid\d+)$/.test(v));
  return new Set(found);
}
function stage(value) {
  const match = normalized(value).match(/임상\s*(?:제\s*)?([123])\s*상|(?:phase|p)\s*([123])\b/);
  return match ? match[1] || match[2] : '';
}
function indication(value) {
  const t = normalized(value);
  if (/\bmash\b|\bnash\b|지방간염|지방간/.test(t)) return 'mash';
  if (/알츠하이머|치매/.test(t)) return 'dementia';
  if (/파킨슨/.test(t)) return 'parkinson';
  if (/비만|체중\s*(?:감량|감소)/.test(t)) return 'obesity';
  if (/당뇨/.test(t)) return 'diabetes';
  return '';
}
function milestone(value) {
  const t = normalized(value);
  if (/철회|취소|중단|실패|미충족|목표\s*미달|유효성\s*미달/.test(t)) return 'negative';
  if (/fda|식약처|품목\s*허가|허가\s*신청|승인/.test(t)) return 'regulatory';
  if (/수주|계약|기술\s*이전|라이선스|투자\s*유치|인수/.test(t)) return 'deal';
  if (/환자\s*(?:모집|등록)|투약\s*(?:개시|시작)|임상.{0,15}(?:개시|착수|진입|시작)|첫\s*투약/.test(t)) return 'enrollment';
  if (/중간\s*(?:결과|데이터|분석)|중간\s*톱라인|interim/.test(t)) return 'interim-readout';
  if (/최종\s*(?:결과|데이터|분석)|final\s*readout/.test(t)) return 'final-readout';
  if (/임상.{0,15}(?:완료|종료)|투약\s*완료/.test(t) && !/결과|데이터/.test(t)) return 'completion';
  const clinical = /임상|[123]\s*상|\bmash\b|\bnash\b|비만|치료제|신약|\bdd\s*[-]?\s*\d+/i.test(t);
  if (clinical && /결과|데이터|톱라인|탑라인|유효성|안전성|효능|효과|입증|개선|감량|체중\s*감소|지표|성과|긍정|성공|발표|공개/.test(t)) return 'readout';
  return '';
}
export function clinicalRelation(a,b) {
  if (a.ticker !== b.ticker) return null;
  const at=String(a.title || ''), bt=String(b.title || '');
  const atCodes=codes(at), btCodes=codes(bt);
  const aAll=codes(at+' '+(a.description || '')), bAll=codes(bt+' '+(b.description || ''));
  const shared=[...aAll].filter(v=>bAll.has(v));
  const pa=stage(at), pb=stage(bt);
  const ia=indication(at), ib=indication(bt);
  const am=milestone(at), bm=milestone(bt);
  const bothClinical = /임상|[123]\s*상|mash|nash|비만|치료제|신약/i.test(at) &&
                       /임상|[123]\s*상|mash|nash|비만|치료제|신약/i.test(bt);
  if (bothClinical && pa && pb && pa!==pb) return false;
  if (bothClinical && ia && ib && ia!==ib) return false;
  if (bothClinical && atCodes.size && btCodes.size && ![...atCodes].some(v=>btCodes.has(v))) return false;
  if (bothClinical && shared.length && am && bm && am!==bm) return false;
  if (!shared.length || !am || am!==bm || !['readout','interim-readout','final-readout'].includes(am)) return null;
  const aTitleCode=[...atCodes].some(v=>bAll.has(v));
  const bTitleCode=[...btCodes].some(v=>aAll.has(v));
  const aPhase=pa || stage(a.description), bPhase=pb || stage(b.description);
  const aIndication=ia || indication(a.description), bIndication=ib || indication(b.description);
  if (aPhase && bPhase && aPhase!==bPhase) return false;
  if (aIndication && bIndication && aIndication!==bIndication) return false;
  const contextual=Boolean(aPhase && bPhase && aPhase===bPhase && aIndication && bIndication && aIndication===bIndication);
  return (aTitleCode || bTitleCode || contextual) && (aPhase || bPhase || aIndication || bIndication) ? true : null;
}
