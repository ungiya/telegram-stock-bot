// One press briefing about Krafton's G-STAR 2026 booth/program is rewritten
// as previews of demos, PUBG x IVE experiential zones and 10th attendance.
// Compare the EVENT, not outlet-specific title wording or the count of demo
// booths/games (some press report four vs five).
const norm = value => String(value||'').normalize('NFKC').toLowerCase();
const published = item => Number(item.pub_ms ?? item.publishedAt);
const DAY=86400000;

const gstar = /지\s*스타|\bg[\s-]*star\b/i;
const expoProgram = /현장|프로그램|체험|시연|출품|참가|부스|전시|공간|콘텐츠|관람|행사|아이브|ive|펍지|pubg|신작|라인업|운영|공개|마련|협업|공략|10\s*년\s*연속/i;
// Distinguish materially new corporate events from repackaged excerpts:
// a contract, public launch, financial results, specific new-IP unveiling,
// cancellation or a post-expo outcome is NOT the Nov 3 program preview.
const independentUpdate = /(?:계약|협약)\s*체결|신규\s*(?:수주|계약|파트너십|투자|인수|공급)|(?:공급|출시|판매)\s*계약|인수\s*합병|지분\s*(?:인수|매각)|(?:정식|공식)\s*(?:출시|발매|론칭)|(?:출시|발매)\s*(?:일|일정)\s*(?:공개|발표|확정)|(?:출시|발매)\s*확정|얼리\s*액세스|사전\s*예약|(?:매출|영업\s*이익|영업\s*손실|순이익|실적|수익|방문객\s*수|관람객\s*수|판매량|누적\s*이용자|예약\s*판매)\s*(?:\d|발표|기록|집계|돌파|증가|감소)|(?:분기|연간)\s*실적|(?:행사|전시|지스타)\s*(?:성과|결과|종료|폐막)|(?:협업|파트너십)\s*(?:성과|계약)|(?:철회|취소|중단|정정|소송|과징금|행정\s*처분)|(?:fda|식약처)\s*(?:허가|승인)/i;
const newTitle = /(?:신작|신규\s*게임|신규\s*ip|프로젝트)\s*['"“‘][^'"”’]{2,50}['"”’].{0,18}(?:최초\s*공개|첫\s*공개|정식\s*발표|출시\s*발표|발매)/i;
const expoLive = /(?:지스타|g[\s-]*star).{0,22}(?:현장\s*생중계|첫\s*날\s*현장|개막\s*현장|현장\s*스케치|현장\s*방문|관람객\s*반응)|(?:개막|폐막)\s*(?:첫날|현장)/i;

const exactReportedUrls = [
  ['inews24.com',/^\/view\/2022038\/?$/],
  ['thedailypost.kr',/^\/news\/articleView\.html$/, 'idxno','116616'],
  ['zdnet.co.kr',/^\/view\/$/, 'no','20261103142021'],
  ['e-science.co.kr',/^\/news\/articleView\.html$/, 'idxno','138827'],
  ['khgames.co.kr',/^\/news\/articleView\.html$/, 'idxno','309956'],
  ['youthdaily.co.kr',/^\/news\/article\.html$/, 'no','229292']
];

function userReportedUrl(url){
  try{
    const u=new URL(url);
    const h=u.hostname.toLowerCase().replace(/^www\./,'');
    return exactReportedUrls.some(([host,path,key,value]) =>
      h===host && path.test(u.pathname) && (!key || u.searchParams.get(key)===value));
  }catch{return false;}
}

// This event was already received many times. Suppress its future syndication
// in both fresh Naver results and pre-existing D1 send queues.
export function reportedKraftonGstarBriefing(item){
  if(item.ticker !== '크래프톤') return false;
  if(userReportedUrl(item.url)) return true;
  const time=published(item);
  if(!Number.isFinite(time) ||
    time < Date.parse('2026-11-02T00:00:00+09:00') ||
    time >= Date.parse('2026-11-19T00:00:00+09:00')) return false;
  const title=norm(item.title),desc=norm(item.description);
  if(!gstar.test(title+' '+desc)) return false;
  // Avoid accidentally blocking a new release or a post-event result which
  // merely cites the same Expo programme in its background paragraph.
  if(independentUpdate.test(title) || newTitle.test(title) || expoLive.test(title)) return false;
  if (!expoProgram.test(title)) return false;
  // A title must actually reference the trade show, unless the text clearly
  // describes its program and the excerpt establishes G-STAR 2026.
  if(!gstar.test(title) && !/현장\s*(?:프로그램|체험|부스|공간|전시)|전시\s*(?:프로그램|공간|콘텐츠)/.test(title)) return false;
  // Exclude coverage of a different year, e.g. "G-STAR 2027" in November 2026.
  if(/(?:지\s*스타|\bg[\s-]*star\b)\s*20(?:2[0-57-9]|[3-9]\d)/i.test(title)) return false;
  return true;
}

export function gstarProgramRelation(a,b) {
  const named=namedExpoRelation(a,b);
  if(named!==null)return named;
  if(a.ticker!==b.ticker) return null;
  const at=published(a),bt=published(b);
  if(!Number.isFinite(at)||!Number.isFinite(bt)||Math.abs(at-bt)>7*DAY) return null;
  const isA=reportedKraftonGstarBriefing(a),isB=reportedKraftonGstarBriefing(b);
  if(isA&&isB)return true;
  if(isA!==isB && gstar.test(norm(a.title)+' '+norm(a.description)) &&
     gstar.test(norm(b.title)+' '+norm(b.description))) return false;
  return null;
}

// Shared exhibition identity for all companies, not just a known G-STAR item.
// The same booth announcement may highlight different showcased technologies.
function expoText(value) {
 return norm(value).replace(/빛가람\s*(?:국제\s*전력\s*기술\s*)?엑스포|빅스포/g,'bixpo');
}
function expoNames(value) {
 const body=expoText(value),names=new Set();
 for(const m of body.matchAll(/\b([a-z][a-z0-9-]*(?:xpo|expo|fair)|ces|mwc)\b/g))names.add(m[1]);
 for(const m of body.matchAll(/([가-힣]{2,25}(?:박람회|엑스포))/g))names.add(m[1]);
 // An observed bilingual name links an acronym to its local event name.
 for(const m of body.matchAll(/([a-z][a-z0-9-]{2,})\s*\(\s*([가-힣 ]{2,40}(?:박람회|엑스포))\s*\)/g)) {
   names.add(m[1]);names.add(m[2].replace(/\s/g,''));
 }
 for(const m of body.matchAll(/([가-힣 ]{2,40}(?:박람회|엑스포))\s*\(\s*([a-z][a-z0-9-]{2,})\s*\)/g)) {
   names.add(m[1].replace(/\s/g,''));names.add(m[2]);
 }
 return names;
}
function namedExpoProfile(item) {
 const whole=norm(item.title),at=whole.lastIndexOf(norm(item.ticker));
 // A roundup headline may announce an unrelated company's deal first.
 const title=at>=0?whole.slice(at):whole;
 const body=expoText(title+' '+item.description);
 const names=expoNames(body),name=[...names][0];
 if(!name)return null;
 // The named event itself is the subject. Do not require an outlet to keep
 // any specific verb ('참가', '선보인다', '선뵌다', '미래 제시') in its headline.
 // For a generic roundup title, require a company-specific exhibition lead.
 if(!expoNames(title).size) {
   const lead=norm(item.description).slice(0,400);
   if(!lead.includes(norm(item.ticker)) || !expoNames(lead).size ||
      !/참가|참여|출품|전시|부스|선보|선봬|선뵈|선뵌/.test(lead))return null;
 }
 if(independentUpdate.test(title)||newTitle.test(title)||expoLive.test(title)||
    /(?:전시|박람회|엑스포).{0,10}(?:수주액|성과|결과)|수주액|계약.{0,8}체결/.test(title))return null;
 const time=published(item);
 if(!Number.isFinite(time))return null;
 const year=body.match(/20\d{2}/)?.[0]||String(new Date(time+9*3600000).getUTCFullYear());
 const edition=body.match(/제\s*(\d+)\s*회/)?.[1]||'';
 const start=body.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)?.slice(1).map(Number).join('-')||'';
 return {name,names,year,edition,start,time};
}
export function namedExpoRelation(a,b) {
 if(a.ticker!==b.ticker)return null;
 const aa=namedExpoProfile(a),bb=namedExpoProfile(b);
 if(!aa||!bb) {
   const known=aa||bb,other=aa?b:a;
   if(known && [...expoNames(other.title+' '+other.description)].some(n=>known.names.has(n)) &&
      (independentUpdate.test(norm(other.title)) || /수주액|계약.{0,8}체결/.test(norm(other.title))))return false;
   return null;
 }
 if(![...aa.names].some(n=>bb.names.has(n)))return false;
 if(aa.year!==bb.year || (aa.edition&&bb.edition&&aa.edition!==bb.edition) ||
    (aa.start&&bb.start&&aa.start!==bb.start))return false;
 return Math.abs(aa.time-bb.time)<=7*DAY?true:null;
}

export function exhibitionNeedsContext(item) {
 const title=norm(item.title),body=title+' '+norm(item.description);
 return !expoNames(body).size && /전시회|박람회|엑스포/.test(body) &&
   !independentUpdate.test(title) && !newTitle.test(title);
}
export function exhibitionHasIdentity(item) {
 return expoNames(item.title+' '+item.description).size>0;
}
