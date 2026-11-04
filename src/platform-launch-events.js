// A named product's release on the same platforms is one event, even when
// the headline leads with global strategy or platform expansion instead.
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/&amp;/g,'&');
const stamp=x=>Number(x.pub_ms??x.publishedAt);
function platforms(text) {
 const s=norm(text),out=new Set();
 if(/ps\s*5|플레이스테이션\s*5|playstation\s*5/.test(s))out.add('ps5');
 if(/xbox|엑스박스/.test(s))out.add('xbox');
 if(/닌텐도\s*스위치|nintendo\s*switch/.test(s))out.add('switch');
 if(/\bpc\b|스팀|\bsteam\b/.test(s))out.add('pc');
 if(/안드로이드|android|ios|앱스토어|구글\s*플레이/.test(s))out.add('mobile');
 return out;
}
function profile(item) {
 const title=norm(item.title),desc=norm(item.description);
 if(/매출|판매량|실적|영업이익|계약|인수|취소|중단|철회|정정|업데이트|신규\s*기능|추가\s*기능|후속작|출시\s*성과|출시\s*예정|출시\s*예고|사전\s*예약/.test(title))return null;
 const body=title+' '+desc;
 if(!/출시|론칭|런칭|상용화|발매|정식\s*상륙|플랫폼\s*확장|콘솔\s*시장\s*공략/.test(body))return null;
 const names=[...body.matchAll(/['"“‘]([^'"”’\n]{4,100})['"”’]/g)]
   .map(m=>m[1].replace(/[^\p{L}\p{N}]/gu,''))
   .filter(n=>n.length>=5&&!/공략|넓힌다|강화|속도|진출|확장|시작|출시|글로벌시장/.test(n));
 const destinations=platforms(title+' '+desc.split(/PC 이용자|pc 이용자|기존|이전에|지난해/)[0]);
 if(!names.length||!destinations.size)return null;
 return {names,destinations};
}
export function platformLaunchRelation(a,b) {
 if(a.ticker!==b.ticker)return null;
 const ta=stamp(a),tb=stamp(b);
 if(!Number.isFinite(ta)||!Number.isFinite(tb)||Math.abs(ta-tb)>3*86400000)return null;
 const aa=profile(a),bb=profile(b);
 if(!aa||!bb||!aa.names.some(n=>bb.names.includes(n)))return null;
 const shared=[...aa.destinations].filter(p=>bb.destinations.has(p));
 // A later release on an entirely different platform is a separate rollout.
 if(!shared.length)return false;
 // One publication can mention PC as the original platform in background.
 // Require the same two console destinations or exactly matching platform sets.
 return shared.length>=2 || (aa.destinations.size===bb.destinations.size && shared.length===aa.destinations.size) ? true:null;
}
