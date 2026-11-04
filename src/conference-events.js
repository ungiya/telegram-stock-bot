// Deduplicate syndicated coverage of an individual medical conference, not
// separate clinical outcomes or new deals. Keep this classifier conservative.
const DATE_DAY=86400000;
const congress=/학술\s*대회|추계\s*학회|춘계\s*학회|심포지엄|컨퍼런스/i;
const gynecology=/산부인과|산부인과\s*개원의사회|산부인과학회/i;
const concreteMilestone=/임상\s*(?:제?\s*[123]\s*상|시험\s*(?:결과|성공|실패|완료)|중간\s*결과|최종\s*결과)|(?:새로운|신규|추가)\s*(?:임상\s*결과|시험\s*결과|연구\s*결과)|(?:임상|연구).{0,12}(?:유효성|안전성)\s*(?:입증|확인)|(?:신제품|치료제|의료기기)\s*(?:정식\s*)?출시|품목\s*허가|(?:fda|식약처)\s*(?:승인|허가)|(?:공급|수출|기술\s*이전)\s*계약|수주|투자\s*유치|영업\s*이익|실적\s*발표|인수\s*합병|해지|철회|취소|정정|소송/i;
const normalized = v=>String(v||'').normalize('NFKC').toLowerCase();
const published = item=>Number(item.pub_ms ?? item.publishedAt);
const congressTitle = item=>normalized(item.title);
const edition = title=>title.match(/제\s*(\d+)\s*(?:차|회)/)?.[1]||'';
const statedYear = title=>title.match(/20(?:2\d|3\d)\s*년/)?.[0].replace(/\s/g,'')||'';
const season = title=>title.includes('춘계')?'spring':title.includes('추계')?'autumn':'';

function matchingGynConference(a,b) {
  if(a.ticker !== b.ticker) return null;
  const at=congressTitle(a),bt=congressTitle(b);
  if(!gynecology.test(at)||!gynecology.test(bt)||!congress.test(at)||!congress.test(bt))return null;
  const ta=published(a),tb=published(b);
  if(!Number.isFinite(ta)||!Number.isFinite(tb)||Math.abs(ta-tb)>21*DATE_DAY)return null;
  const ea=edition(at),eb=edition(bt);
  const ya=statedYear(at),yb=statedYear(bt);
  // Source headlines may omit "autumn" even when the lead makes it explicit.
  const sa=season(at+' '+normalized(a.description)),sb=season(bt+' '+normalized(b.description));
  if((ea&&eb&&ea!==eb)||(ya&&yb&&ya!==yb)||(sa&&sb&&sa!==sb))return false;
  // An explicit edition in just one headline is not automatically the same
  // conference. The user-reported October 18 meeting is edition 22.
  if((ea&&!eb||eb&&!ea)&&(ea||eb)!=='22')return false;
  if(concreteMilestone.test(at)||concreteMilestone.test(bt))return false;
  // Shared specialty, congress type and near publication date are the event
  // identity; individual article product focus need not match.
  return true;
}

export function conferenceRelation(a,b) {
  return matchingNamedConference(a,b) ?? matchingGynConference(a,b);
}

// Two links confirmed already delivered for the Oct 18 gynecology congress.
// Future syndications about that event are filtered even when the first copy
// is absent from the normal article cache. This rule expires in November.
export function reportedPharmGynCongress(item) {
  if(item.ticker!=='파마리서치')return false;
  try {
    const url=new URL(item.url);
    const host=url.hostname.toLowerCase().replace(/^www\./,'');
    const number=url.searchParams.get('idxno');
    if(url.pathname==='/news/articleView.html'&&(
      (host==='medisobizanews.com'&&number==='143891')||
      (host==='pharmnews.com'&&number==='307548')
    ))return true;
  }catch { /* Malformed or absent URLs may still be matched by content. */ }
  const stamp=published(item);
  if(!Number.isFinite(stamp)||
     stamp<Date.parse('2026-10-18T00:00:00+09:00')||
     stamp>=Date.parse('2026-11-20T00:00:00+09:00'))return false;
  const headline=congressTitle(item);
  if(!gynecology.test(headline)||!congress.test(headline))return false;
  if(concreteMilestone.test(headline))return false;
  if(/춘계|제\s*(?!22\b)\d+\s*차|2025\s*년|2027\s*년/.test(headline))return false;
  const body=headline+' '+normalized(item.description);
  // Headline/summary must identify this particular fall congress coverage.
  return /추계|제\s*22\s*차|스위스\s*그랜드|개원의사회|자이너|창상\s*피복재|pn\s*관련|pn\s*임상|지난\s*(?:10\s*월\s*)?18\s*일|10\s*월\s*18\s*일/.test(body);
}

// Any company's coverage of one named society meeting is a single event,
// even when each outlet headlines a different product or clinical application.
function matchingNamedConference(a,b) {
  if(a.ticker!==b.ticker)return null;
  const at=congressTitle(a),bt=congressTitle(b);
  const names=t=>new Set(t.match(/[가-힣]{2,25}(?:학회|학술회)/g)||[]);
  const an=names(at),bn=names(bt);
  if(![...an].some(n=>bn.has(n)))return null;
  const attendance=/참가|참여|전시|부스|선보|소개/;
  if(!attendance.test(at)||!attendance.test(bt))return null;
  // New scientific outcomes or regulatory/contract news remain independently alertable.
  if(concreteMilestone.test(at)||concreteMilestone.test(bt)||
     /(?:임상|연구|시험).{0,12}결과\s*(?:공개|발표)/.test(at+' '+bt))return false;
  const ta=published(a),tb=published(b);
  if(!Number.isFinite(ta)||!Number.isFinite(tb)||Math.abs(ta-tb)>3*DATE_DAY)return null;
  const aa=at+' '+normalized(a.description),bb=bt+' '+normalized(b.description);
  for(const identify of [edition,statedYear,season]) {
    const x=identify(aa),y=identify(bb);
    if(x&&y&&x!==y)return false;
  }
  const start=t=>t.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/)?.slice(1).map(Number).join('-')||'';
  const ad=start(aa),bd=start(bb);
  if(ad&&bd&&ad!==bd)return false;
  // A year/season, numbered edition or dated meeting anchors the event.
  // Bare society names alone are not enough to merge unrelated appearances.
  const identified=t=>Boolean(edition(t)||start(t)||(statedYear(t)&&season(t)));
  return identified(aa)&&identified(bb)?true:null;
}
