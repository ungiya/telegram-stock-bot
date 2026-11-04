// Shared event comparison for every watchlist company, without per-company
// names, dated exceptions, external APIs or additional search calls.
const DAY=86400000;
const norm=v=>String(v||'').normalize('NFKC').toLowerCase()
 .replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/(?<=\d),(?=\d)/g,'')
 .replace(/전\s*분기\s*대비|전분기\s*대비/g,'전분기대비')
 .replace(/자기\s*주식/g,'자사주').replace(/사들여|사들인다|취득/g,'매입')
 .replace(/드럭\s*스토어/g,'드럭스토어').replace(/매장\s*입성|입성/g,'입점')
 .replace(/거래\s*대금|거래\s*규모/g,'거래액');
const time=x=>Number(x.pub_ms??x.publishedAt);
function action(t) {
 if(/입점/.test(t))return 'entry';
 if(/자사주/.test(t)&&/매입|소각/.test(t))return 'buyback';
 if(/거래액/.test(t)&&/분기|증가|급증|최대/.test(t))return 'gmv';
 if(/공급\s*계약|수주/.test(t))return 'contract';
 if(/협약|제휴|파트너십|맞손/.test(t))return 'partnership';
 if(/출시|론칭|런칭|선보|선봬|서비스\s*(?:시작|개시)|상용화/.test(t))return 'launch';
 return '';
}
// Follow-up outcomes and changes must pass through to the existing detailed
// comparators, even when they quote the old announcement in the excerpt.
const changed=/취소|철회|해지|정정|재공시|완료|중단|재개|소송|(?:출시|입점|협약)\s*(?:성과|결과)|(?:추가|신규)\s*(?:국가|기능|계약)|매출|판매량|판매액|영업이익|순이익/;
const stop=/^(관련|대한|통해|위해|위한|기반|국내|해외|현지|글로벌|최대|최초|규모|분기|매장|입점|발표|신규|추가|서비스|브랜드|사업|회사|기업|시장|상품|제품|고객|판매|운영|성장|확대|강화|공략|주주환원|주가|최대규모|오프라인|온라인|드럭스토어|체인|전국|상당|가치|제고|자사주|매입|소각|전량|결정|거래액|급증|증가|기록|역대|실적|목표|계획|올해|내년|지난해|전년|이번|이날|밝혔다|기자|뉴스|협약|제휴|출시|공식|신제품|사업강화)$/;
function anchors(value,ticker) {
 const s=norm(value).replace(/\[[^\]]*\]/g,' ').split(norm(ticker)).join(' ');
 return new Set((s.match(/[a-z]+\d+(?:\.\d+)?|[a-z]{3,}|[가-힣]{2,}/g)||[])
  .map(w=>w.replace(/(?:에서는|으로는|으로|에서|에게|까지|부터|와의|과의|은|는|을|를|이|가|의|에|와|과)$/,''))
  .filter(w=>w.length>=2&&!stop.test(w)));
}
function grams(s) {const v=norm(s).replace(/\s|[^\p{L}\p{N}]/gu,'');return new Set(Array.from({length:Math.max(0,v.length-2)},(_,i)=>v.slice(i,i+3)));}
function similarity(a,b) {const aa=grams(a),bb=grams(b);if(!aa.size||!bb.size)return 0;return [...aa].filter(v=>bb.has(v)).length/Math.min(aa.size,bb.size);}
function metric(s,pattern) {return [...s.matchAll(pattern)].map(m=>Number(m[1]));}
function disjoint(a,b){return a.length&&b.length&&!a.some(v=>b.includes(v));}
function facts(s) {
 return {
  quarter:metric(s,/([1-4])\s*(?:분기|q\b)/g),
  year:metric(s,/(20\d{2})\s*년/g),
  stores:metric(s,/(\d+)\s*개\s*(?:전\s*)?매장/g),
  amount:[...s.matchAll(/(\d+(?:\.\d+)?)\s*(조|억)\s*원/g)].map(m=>Number(m[1])*(m[2]==='조'?10000:1))
 };
}
export function commonEventRelation(a,b) {
 if(a.ticker!==b.ticker)return null;
 const ta=time(a),tb=time(b);
 if(!Number.isFinite(ta)||!Number.isFinite(tb)||Math.abs(ta-tb)>3*DAY)return null;
 const at=norm(a.title),bt=norm(b.title);
 if(changed.test(at)||changed.test(bt))return null;
 const category=action(at);
 if(!category||category!==action(bt))return null;
 const aa=at+' '+norm(a.description),bb=bt+' '+norm(b.description);
 const fa=facts(aa),fb=facts(bb);
 if(category==='entry') {
   const retailer=s=>[...s.matchAll(/([가-힣a-z]{2,})\s*(?:\d+\s*개\s*)?(?:전\s*)?매장/g)]
     .map(m=>m[1]).filter(w=>!/^(캐나다|미국|일본|한국|중국|유럽|전국|현지|전체|약|전)$/.test(w));
   const ar=retailer(aa),br=retailer(bb);
   if(ar.length&&br.length&&!ar.some(x=>br.includes(x)))return false;
 }
 if(category==='gmv') {
   const basis=s=>/전년|작년|동기/.test(s)?'yoy':/전분기대비/.test(s)?'qoq':'';
   if(basis(aa)&&basis(bb)&&basis(aa)!==basis(bb))return false;
 }
 if(disjoint(fa.quarter,fb.quarter)||disjoint(fa.year,fb.year)||disjoint(fa.stores,fb.stores))return false;
 // Annual return totals and one transaction amount need not be identical sets.
 // Require at least one shared amount when both articles state amounts.
 if(disjoint(fa.amount,fb.amount))return false;
 const aWords=anchors(aa,a.ticker),bWords=anchors(bb,b.ticker);
 const aTitle=anchors(at,a.ticker),bTitle=anchors(bt,b.ticker);
 const shared=[...aWords].filter(w=>bWords.has(w));
 const cross=new Set([...aTitle].filter(w=>bWords.has(w)).concat([...bTitle].filter(w=>aWords.has(w))));
 const named=shared.filter(w=>/[a-z]/.test(w)||w.length>=3);
 if(category==='gmv') {
   const ap=metric(aa,/(\d+(?:\.\d+)?)\s*%/g),bp=metric(bb,/(\d+(?:\.\d+)?)\s*%/g);
   if(fa.quarter.length&&fb.quarter.length&&ap.length&&bp.length&&
      !disjoint(ap,bp)&&named.length&&cross.size>=1)return true;
 }
 // Same action plus named subjects and quantitative evidence handles rewritten
 // distribution announcements, contracts and product launches across outlets.
 const hard=(fa.stores.length&&fb.stores.length)||(fa.amount.length&&fb.amount.length);
 if(shared.length>=2&&named.length>=1&&cross.size>=2&&hard&&similarity(aa,bb)>=0.28)return true;
 // A common subject must appear in both headlines or cross into the other lead.
 // Generic corporate boilerplate on its own is insufficient.
 if(shared.length>=4&&named.length>=2&&cross.size>=3&&similarity(a.description,b.description)>=0.55)return true;
 return null;
}
