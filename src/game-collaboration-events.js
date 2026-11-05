const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/pubg\s*:\s*/g,'');
const compact=v=>norm(v).replace(/[^\p{L}\p{N}]/gu,'');
function profile(item){
 const title=norm(item.title),body=title+' '+norm(item.description).split(/앞서|이전에|지난번|기존에/)[0];
 if(!/협업|콜라보|컬래버|콜래버|콜라보레이션/.test(body)||!/업데이트|콘텐츠|테마\s*공간/.test(body))return null;
 const partner=body.match(/(?:걸그룹|그룹|아티스트)\s*['"‘“]?([가-힣a-z0-9]+?)(?:['"’”]|와의|과의|의\s|와\s|과\s|\s)/)?.[1];
 if(!partner)return null;
 const names=new Set([...body.matchAll(/['"‘“]([^'"’”\n]{2,80})['"’”]/g)].map(m=>compact(m[1])).filter(n=>n!==compact(partner)));
 if(!names.size)return null;
 return {names,partner:compact(partner),version:body.match(/(\d+\.\d+(?:\.\d+)?)\s*업데이트/)?.[1],changed:/취소|철회|중단|종료|정정|매출|성과|판매량|추가\s*협업|재협업/.test(title)};
}
export function gameCollaborationRelation(a,b){
 if(a.ticker!==b.ticker)return null;
 const delta=Math.abs(Number(a.pub_ms??a.publishedAt)-Number(b.pub_ms??b.publishedAt));
 if(!Number.isFinite(delta)||delta>3*86400000)return null;
 const x=profile(a),y=profile(b);if(!x||!y)return null;
 if(x.changed||y.changed||x.partner!==y.partner)return false;
 if(x.version&&y.version&&x.version!==y.version)return false;
 return [...x.names].some(n=>y.names.has(n))?true:false;
}
