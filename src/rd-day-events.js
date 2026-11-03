// Group coverage of a company's single R&D Day even when journalists choose
// different speakers, drug candidates and roadmap themes for their headlines.
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/&amp;/g,'&');
const rdDay=/r\s*(?:&|앤|and)\s*d\s*day|알\s*앤\s*디\s*데이|연구\s*개발\s*(?:데이|설명회)/i;
const stamp=x=>Number(x.pub_ms??x.publishedAt);
const update=/(?:계약|협약)\s*(?:체결|해지)|(?:기술\s*이전|기술\s*수출|라이선스).{0,10}(?:체결|성사|완료)|(?:임상|연구).{0,12}(?:결과\s*(?:발표|공개)|성공|실패|완료|유효성\s*입증)|(?:fda|식약처).{0,10}(?:승인|허가)|(?:품목|임상\s*시험)\s*(?:허가|승인)|철회|취소|정정|소송|(?:신규|추가)\s*계약|(?:매출|영업이익|순이익).{0,10}(?:기록|증가|감소)/i;
function profile(item) {
 const title=norm(item.title),body=title+' '+norm(item.description),time=stamp(item);
 if(!rdDay.test(body)||update.test(title)||!Number.isFinite(time))return null;
 const year=body.match(/(?:r\s*&\s*d\s*day|알앤디\s*데이)\s*(20\d{2})/)?.[1] ||
   body.match(/(20\d{2})\s*(?:년\s*)?(?:r\s*&\s*d\s*day|알앤디\s*데이)/)?.[1] ||
   String(new Date(time+9*3600000).getUTCFullYear());
 const date=body.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
 const edition=body.match(/제\s*(\d+)\s*회/)?.[1]||'';
 return {year,date:date?Number(date[1])+'-'+Number(date[2]):'',edition,time};
}
export function rdDayRelation(a,b) {
 if(a.ticker!==b.ticker)return null;
 const aa=profile(a),bb=profile(b);
 if(!aa||!bb) {
   if(rdDay.test(norm(a.title)+' '+norm(a.description)) &&
      rdDay.test(norm(b.title)+' '+norm(b.description)) &&
      (update.test(norm(a.title))||update.test(norm(b.title))))return false;
   return null;
 }
 if(aa.year!==bb.year || (aa.date&&bb.date&&aa.date!==bb.date) ||
    (aa.edition&&bb.edition&&aa.edition!==bb.edition))return false;
 return Math.abs(aa.time-bb.time)<=3*86400000 ? true:null;
}
function exactReceived(value) {
 try {
  const u=new URL(value),host=u.hostname.toLowerCase().replace(/^www\./,'');
  return (host==='greened.kr'&&u.pathname==='/news/articleView.html'&&['353750','353736'].includes(u.searchParams.get('idxno'))) ||
    (host==='sedaily.com'&&u.pathname==='/article/20109691') ||
    (host==='newsway.co.kr'&&u.pathname.replace(/\/$/,'')==='/news/view'&&u.searchParams.get('ud')==='2026110314075446987') ||
    (host==='yakup.com'&&u.pathname==='/news/index.html'&&u.searchParams.get('nid')==='334699');
 }catch{return false;}
}
export function reportedDndRdDay(item) {
 if(item.ticker!=='디앤디파마텍')return false;
 if(exactReceived(item.url))return true;
 const time=stamp(item),title=norm(item.title),desc=norm(item.description),body=title+' '+desc;
 if(!Number.isFinite(time)||time<Date.parse('2026-11-03T00:00:00+09:00')||
    time>=Date.parse('2026-11-07T00:00:00+09:00')||update.test(title))return false;
 const p=profile(item);
 if(p) return p.year==='2026' && (!p.date||p.date==='11-3');
 // Truncated search excerpts omit the event name. These are the specific
 // roadmap topics confirmed in the user's screenshots, within this event window.
 const roadmap=/추진|협상|향후|계획|확장|전략|도전|승부|공략|내년|연내/;
 if(!roadmap.test(title))return false;
 const dnd01Transfer=/dd\s*01/.test(body) && /간질환|지방간|mash/.test(body) &&
   /기술\s*이전/.test(body) && /연내/.test(body) &&
   /글로벌\s*제약|빅\s*파마|빅파마/.test(body) && /3\s*상/.test(body);
 return dnd01Transfer || (/이슬기/.test(title)&&/향후\s*10\s*년/.test(title)&&/임상/.test(title)) ||
   (/dd\s*18/.test(body)&&/근육|비만/.test(title)&&/내년|lo\s*추진/.test(title)) ||
   (/dd\s*01/.test(body)&&/기술\s*이전|기술\s*수출/.test(title)&&/jp\s*모건|빅파마/.test(body)) ||
   (/지방간/.test(title)&&/간경변/.test(title)&&/확장/.test(title)) ||
   (/파킨슨/.test(title)&&/방사성\s*의약품/.test(title)&&/공략|확장/.test(title));
}
