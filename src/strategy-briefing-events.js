// Cross-publisher event identity for CAPITAL-BACKED STRATEGY BRIEFINGS.
// A single investor/R&D day is often retold as "cash runway", "licensing
// targets", or "global platform strategy". Do not require matching headlines.
// Applies to every ticker, without per-company names, dates or article URLs.
const DAY=86400000;
const normalize=v=>String(v||'').normalize('NFKC').toLowerCase()
  .replace(/<[^>]*>/g,' ')
  .replace(/\[[^\]]{1,50}\]/g,' ')
  .replace(/(?<=\d),(?=\d)/g,'');
const timestamp=x=>Number(x.pub_ms??x.publishedAt);
const titleCash=/(?:실탄|우군|투자\s*재원|현금\s*자산|자금\s*확보|자금력|자본\s*확충|유동성\s*확보|대규모\s*투자\s*유치)/i;
const future=/(?:내년|향후|앞으로|중장기|올해|장기|미래|목표|계획|전략|로드맵|비전|도약|성장\s*동력|정조준|추진|공략|확대|강화|가속|시험대|투입|사업화|연구개발)/i;
const concreteUpdate=/(?:계약|협약)\s*(?:체결|해지|완료|확정)|(?:신규|추가)\s*(?:수주|계약|공급|납품|인수)|(?:기술\s*(?:이전|수출)|라이선스).{0,10}(?:계약\s*(?:체결|성사)|성사|완료|확정)|(?:임상|시험).{0,18}(?:결과\s*(?:발표|공개)|성공|실패|중단|승인|완료)|(?:fda|식약처).{0,10}(?:승인|허가)|(?:신규|추가)\s*(?:투자\s*유치|자금\s*조달)\s*(?:확정|완료)|(?:투자\s*유치|유상\s*증자|인수\s*합병)\s*(?:확정|완료|체결)|(?:분기|연간|연결)\s*(?:실적|매출)|(?:매출|영업\s*이익|당기\s*순이익).{0,10}(?:발표|달성|증가|기록)|정정|철회|취소|중단|소송|(?:출시|판매|상용화)\s*(?:확정|완료)|(?:신제품|신작|신규\s*모델).{0,15}(?:정식\s*출시|첫\s*공개|최초\s*공개)/i;
const topicGroups=[
  /(?:신약|파이프라인|기술\s*(?:수출|이전)|라이선스|연구\s*개발|\br\s*&?\s*d\b|플랫폼\s*바이오|임상\s*개발|항체|약물\s*개발)/i,
  /(?:공장|증설|설비\s*투자|생산\s*설비|생산\s*능력|생산\s*라인|양산\s*시설|제조\s*시설)/i,
  /(?:해외\s*(?:진출|사업|수출|시장)|글로벌\s*(?:사업|시장|판매)|수출\s*확대|해외\s*판매)/i,
  /(?:차세대\s*(?:기술|제품|모델)|기술\s*개발|신규\s*(?:플랫폼|사업|기술)|연구\s*투자|기술\s*고도화)/i,
  /(?:신작\s*게임|게임\s*개발|게임\s*사업|콘텐츠\s*제작|스튜디오\s*투자|퍼블리싱\s*전략)/i,
  /(?:전력망|에너지\s*저장|데이터\s*센터|배터리\s*사업|전력\s*사업|반도체\s*사업)/i
];
function cashAmount(title) {
 const values=[...title.matchAll(/(\d+(?:\.\d+)?)\s*(조|억)(?:\s*원)?/g)]
  .map(m=>Number(m[1])*(m[2]==='조'?10000:1));
 return values.length===1?values[0]:null;
}
function topics(text) {
 return new Set(topicGroups.flatMap((pattern,i)=>pattern.test(text)?[i]:[]));
}
function profile(item) {
 const title=normalize(item.title),desc=normalize(item.description),at=timestamp(item);
 if(!item.ticker||!Number.isFinite(at))return null;
 if(!titleCash.test(title)||concreteUpdate.test(title))return null;
 if(!future.test(title+' '+desc))return null;
 const subject=topics(title+' '+desc);
 if(!subject.size)return null;
 return {title,subject,at,amount:cashAmount(title),metaphor:/실탄/.test(title)};
}
export function strategyBriefingRelation(a,b) {
 if(!a.ticker||a.ticker!==b.ticker)return null;
 const x=profile(a),y=profile(b);
 // An actual deal, trial result or correction is a new event, even if the
 // summary repeats that day's strategy briefing.
 if(!x||!y){
  const titles=normalize(a.title)+' '+normalize(b.title);
  if((x||y)&&concreteUpdate.test(titles))return false;
  return null;
 }
 const gap=Math.abs(x.at-y.at);
 if(gap>36*3600000)return null;
 const sameTopic=[...x.subject].some(i=>y.subject.has(i));
 if(!sameTopic)return null;
 if(x.amount!==null&&y.amount!==null&&x.amount!==y.amount)return false;
 // Without a common monetary amount, require both headlines to use the
 // distinctive "실탄" framing and arrive in one closely timed news cycle.
 const matchingAmount=x.amount!==null&&y.amount!==null&&x.amount===y.amount;
 if(matchingAmount)return true;
 if(x.metaphor&&y.metaphor&&gap<=12*3600000)return true;
 return null;
}
