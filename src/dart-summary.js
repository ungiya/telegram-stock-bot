// Extract verified source fields, without guessing numbers or generating advice.
export const SUMMARY_MARKER = '[핵심 항목]';
const definitions = [
 ['내용', /^(?:계약내용|계약명|해지계약명|판매[ㆍ·]?공급계약내용)$/],
 ['상대방', /^(?:계약상대|계약상대방|계약상대회사)$/],
 ['금액', /^(?:해지금액|계약금액|확정계약금액|총계약금액)(?:\(.*\))?$/],
 ['매출 대비', /^(?:매출액?대비|매출액?대비비율)(?:\(.*\))?$/],
 ['사유', /^(?:해지주요사유|해지사유|변경사유|정정사유|발행목적|취득목적|처분목적)$/],
 ['일자', /^(?:해지일자|계약체결일|계약체결일자|이사회결의일|결정일)(?:\(.*\))?$/],
 ['시작일', /^시작일$/], ['종료일', /^종료일$/],
 ['신주', /^신주의종류와수|보통주식\(주\)|기타주식\(주\)$/],
 ['발행가', /^(?:신주발행가액|발행가액|확정발행가액)(?:\(.*\))?$/],
 ['조달금액', /^(?:총발행금액|발행총액|조달금액)(?:\(.*\))?$/],
 ['자금 용도', /^(?:자금조달의목적|시설자금|운영자금|채무상환자금|타법인증권취득자금)(?:\(.*\))?$/],
 ['증자 방식', /^증자방식$/], ['납입일', /^납입일(?:\(.*\))?$/],
 ['배당금', /^(?:주당배당금|1주당배당금)(?:\(.*\))?$/],
 ['배당률', /^시가배당[률율](?:\(.*\))?$/],
 ['기준일', /^배당기준일$/], ['지급일', /^배당금지급예정일자?$/],
 ['규모', /^(?:취득예정금액|처분예정금액|투자금액|취득금액|처분금액)(?:\(.*\))?$/],
 ['지분', /^(?:지분비율|소유주식비율)(?:\(.*\))?$/],
 ['변경 내용', /^(?:변경내용|주요내용|결정내용)$/]
];
const cleanLabel = s => s.replace(/^\s*(?:\d+[.)]|[-※])\s*/,'').replace(/\s/g,'').replace(/[：:]$/,'');
const labelType = s => definitions.find(([,pattern])=>pattern.test(cleanLabel(s)));
const shorten = (s,n) => s.length>n?s.slice(0,n-1)+'…':s;
export function summarizeFiling(report, body){
 if(!body?.trim())return '본문을 불러오지 못했습니다. 원문 링크에서 확인해 주세요.';
 const lines=body.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 const fields=[];
 for(let i=0;i<lines.length;i++){
  const cells=lines[i].split(/\s*\|\s*/).filter(Boolean);
  // DART tables can have adjacent label/value cells or one cell per line.
  for(let j=0;j<cells.length;j++){
   const def=labelType(cells[j]);if(!def)continue;
   let value=cells[j+1];
   if(!value && i+1<lines.length && !labelType(lines[i+1].split('|')[0]) && !/^\d+[.)]\s/.test(lines[i+1]))value=lines[i+1];
   if(!value || labelType(value) || /^[-—]$/.test(value))continue;
   const label=cells[j].replace(/^\s*(?:\d+[.)]|[-※])\s*/,'').trim();
   // Keep original labels/units. Never turn an arbitrary table column into a current-period figure.
   const row=label+': '+shorten(value,150);
   if(!fields.includes(row))fields.push(row);
  }
 }
 if(/정정/.test(report)){
  // Before/after tables need their column headings; do not select a number from
  // an ambiguous row and present it as the corrected figure.
  const start=lines.findIndex(l=>/정정사항|정정항목/.test(l));
  if(start>=0)return '정정 내용 · 원문 발췌\n'+shorten(lines.slice(start,start+9).join('\n'),950);
 }
 if(fields.length)return fields.slice(0,8).join('\n');
 // Unknown and multi-period financial tables: preserve context and label this
 // explicitly as an excerpt, instead of inventing an interpretation.
 const start=lines.findIndex(l=>/매출액|영업이익|주요내용|결정내용|변경내용|사유/.test(l));
 const excerpt=lines.slice(Math.max(0,start-2),Math.max(0,start-2)+8).join('\n');
 return '주요 부분 · 원문 발췌\n'+shorten(excerpt,950);
}
