// Match the transaction from either licensor's or licensee's viewpoint.
const norm=v=>String(v||'').normalize('NFKC').toLowerCase()
 .replace(/한국\s*전력\s*공사|한국\s*전력|\b한전\b/g,'한전')
 .replace(/고장\s*예측|예방\s*진단/g,'진단');
const changed=/취소|철회|해지|정정|소송|재계약|추가\s*계약|계약\s*변경|기술료|로열티|매출|양산|상용화\s*(?:완료|성공)|도입\s*성과/;
function profile(item) {
 const title=norm(item.title),body=title+' '+norm(item.description);
 if(!/기술(?:을|를)?\s*(?:이전|도입|확보)|(?:이전|도입|확보)\s*기술/.test(body))return null;
 const clean=body.split(norm(item.ticker)).join(' ');
 // Named counterparties, not the company being monitored or exhibition venue.
 const partners=new Set((clean.match(/[가-힣a-z]+(?:공사|연구원|연구소|대학교|대학|전자|전기|테크|바이오|제약)|한전/g)||[]));
 const subjects=new Set();
 for(const m of clean.matchAll(/([가-힣a-z0-9]+(?:\s+[가-힣a-z0-9]+){0,3})\s*(?:기술|솔루션)/g)){
  if(/엑스포|박람회/.test(clean.slice(m.index+m[0].length,m.index+m[0].length+8)))continue;
  const subject=[...partners].reduce((s,p)=>s.split(p).join(' '),m[1]);
  const s=subject.replace(/(?:자체|개발한|기반|인공지능|한전|공사의|공사|의|을|를)/g,'').replace(/\s/g,'');
  for(let i=0;i+4<=s.length;i++)subjects.add(s.slice(i,i+4));
 }
 return {partners,subjects,changed:changed.test(title)};
}
const common=(a,b)=>[...a].some(x=>b.has(x));
export function technologyTransferRelation(a,b){
 if(a.ticker!==b.ticker)return null;
 const delta=Math.abs(Number(a.pub_ms??a.publishedAt)-Number(b.pub_ms??b.publishedAt));
 if(!Number.isFinite(delta)||delta>3*86400000)return null;
 const x=profile(a),y=profile(b);if(!x||!y)return null;
 if(x.changed||y.changed)return false;
 if(x.partners.size&&y.partners.size&&!common(x.partners,y.partners))return false;

 const models=s=>new Set((norm(s.title+' '+s.description).match(/\b[a-z]{2,}[-]?\d+[a-z0-9]*\b/g)||[]));
 const am=models(a),bm=models(b);
 if(am.size&&bm.size&&!common(am,bm))return false;
 if(common(x.partners,y.partners)&&([...x.subjects].filter(s=>y.subjects.has(s)).length>=2))return true;
 if(common(x.partners,y.partners)&&x.subjects.size&&y.subjects.size)return false;
 return null;
}
