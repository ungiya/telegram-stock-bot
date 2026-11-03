// Compare same-company forward-looking coverage by forecast year and business
// themes. A future outlook is distinct from a trial result or signed agreement.
function profile(item) {
  const title=String(item.title||'').normalize('NFKC');
  const body=title+' '+String(item.description||'').normalize('NFKC');
  const stamp=Number(item.pub_ms ?? item.publishedAt);
  if (!Number.isFinite(stamp)) return null;
  const year=new Date(stamp+9*3600000).getUTCFullYear();
  const horizon=title.match(/(20\d{2})\s*년/)?.[1] || (/내년|내년도/.test(title)?String(year+1):'');
  if (!horizon) return null;
  if (!/기대|전망|가능성|모멘텀|기회|예상|분석|재도전/.test(body)) return null;
  if (/계약\s*체결|수주|승인|허가|첫\s*투약|환자\s*등록|임상.{0,12}(?:결과|성공|실패|중단)|실적\s*발표|영업이익|소송|정정|철회|취소/.test(title)) return null;
  const themes=new Set();
  if (/임상|신약\s*개발|파이프라인/.test(body)) themes.add('clinical');
  if (/기술\s*(?:수출|이전)|라이선스\s*아웃/.test(body)) themes.add('licensing');
  const assets=new Set([...body.toUpperCase().matchAll(/\b([A-Z]{2,6})[-\s]?([A-Z]?\d{1,4})(?:[-\s]?([A-Z]\d?))?\b/g)].map(m=>m[1]+m[2]+(m[3]||'')));
  const phase=title.match(/임상\s*([123])\s*상/)?.[1];
  return {horizon,themes,assets,phase,stamp};
}
export function outlookRelation(a,b){
  if(a.ticker!==b.ticker)return null;
  const aa=profile(a),bb=profile(b);if(!aa||!bb)return null;
  if(aa.horizon!==bb.horizon)return false;
  if(Math.abs(aa.stamp-bb.stamp)>3*86400000)return null;
  if(aa.phase&&bb.phase&&aa.phase!==bb.phase)return false;
  if(aa.assets.size&&bb.assets.size&&![...aa.assets].some(x=>bb.assets.has(x)))return false;
  return aa.themes.has('clinical')&&aa.themes.has('licensing')&&bb.themes.has('clinical')&&bb.themes.has('licensing')?true:null;
}
