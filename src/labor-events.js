// Event-level deduplication for labor-dispute reports. An announced strike
// must never hide a subsequent real walkout, cancellation or negotiated deal.
const DAY=86400000;
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase();
const stamp=item=>Number(item.pub_ms ?? item.publishedAt);
const laborContext=/(?:노조|노동조합|조합원|노사|사무\s*기술직|노동자|임단협)/;
const payContext=/(?:임금|급여|성과급|임단협|보상|기본급|교섭)/;

export function laborStage(item) {
  const headline=normalize(item.title);
  const body=headline+' '+normalize(item.description);
  if(!laborContext.test(body) || !payContext.test(body)) return '';
  // The headline drives stage classification: an older warning mentioned in
  // the excerpt must not turn a new strike / settlement into a repeat warning.
  if(/파업\s*(?:철회|취소|중단|종료)|쟁의\s*(?:철회|중단)/.test(headline))return 'withdrawn';
  if(/임금\s*(?:협상|교섭).{0,14}(?:타결|합의)|(?:임단협|노사).{0,14}(?:타결|합의)|잠정\s*합의|협상\s*타결/.test(headline))return 'settled';
  if(/(?:실제|본격|첫|부분|전면|총)?\s*파업.{0,12}(?:돌입|시작|진행|강행|실시|벌였|벌여|첫날)|(?:돌입|시작).{0,10}파업/.test(headline)
     && !/예고|예정|계획|가능성|경고|시사|초읽기|앞두/.test(headline))return 'started';
  if(/파업.{0,15}(?:예고|예정|계획|가능성|경고|시사|초읽기|앞두)|(?:첫|부분|총|전면)\s*파업\s*(?:선언|예고)|파업\s*(?:카드|경고장)/.test(headline))return 'announced';
  if(/(?:쟁의\s*행위|파업)\s*(?:찬반\s*)?투표|쟁의권\s*확보|투표\s*가결/.test(headline))return 'vote';
  if(/(?:임단협|임금\s*협상|노사\s*교섭).{0,14}(?:결렬|난항|교착)/.test(headline))return 'negotiation';
  return '';
}

// Only match reporting of the same wage dispute and the same stage within
// a short reporting window. Keep later phases separate, even for the same union.
export function laborRelation(a,b) {
  if(a.ticker!==b.ticker)return null;
  const ta=stamp(a),tb=stamp(b);
  if(!Number.isFinite(ta)||!Number.isFinite(tb)||Math.abs(ta-tb)>7*DAY)return null;
  const sa=laborStage(a),sb=laborStage(b);
  if(!sa||!sb)return null;
  if(sa!==sb)return false;
  const first=/\b(?:first)\b|첫\s*(?:번째)?\s*파업/;
  const later=/재파업|2\s*차\s*파업|두\s*번째\s*파업|추가\s*파업|다시\s*파업/;
  const at=normalize(a.title),bt=normalize(b.title);
  if((first.test(at)&&later.test(bt))||(first.test(bt)&&later.test(at)))return false;
  return sa==='announced' || sa==='started' || sa==='settled' || sa==='withdrawn' || sa==='vote';
}

// This exact wage/strike-warning story already reached the user. Pre-queue
// and pending-queue checks should prevent syndicated versions resurfacing.
// Restrict by ticker, dates and stage. A real strike is news and is not muted.
export function reportedHyosungStrikeNotice(item) {
  if(item.ticker!=='효성중공업')return false;
  try {
    const url=new URL(item.url);
    const host=url.hostname.toLowerCase().replace(/^www\./,'');
    if(host==='mdtoday.co.kr'&&url.pathname==='/news/articleView.html'&&
      url.searchParams.get('idxno')==='622617')return true;
  }catch { /* Reworded articles can still be matched by event. */ }
  const t=stamp(item);
  if(!Number.isFinite(t)||t<Date.parse('2026-11-01T00:00:00+09:00')||
     t>=Date.parse('2026-11-12T00:00:00+09:00'))return false;
  if(laborStage(item)!=='announced')return false;
  const title=normalize(item.title);
  const body=title+' '+normalize(item.description);
  if(!/(?:효성중공업|노조|노동조합|사무\s*기술직)/.test(body))return false;
  // Focus on the reported first walkout notice rather than indefinitely
  // suppressing every future labor headline at the company.
  if(/재파업|2\s*차\s*파업|두\s*번째\s*파업|추가\s*파업|다시\s*파업/.test(title))return false;
  return /파업/.test(title)&&/(?:첫\s*파업|노조|노동조합|사무\s*기술직|임금|성과급|보상)/.test(body);
}
