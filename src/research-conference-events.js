// Syndicated announcements can headline either the research package or attendance.
// Identify the meeting and announced package before generic headline comparison.
const DAY=86400000;
const norm=v=>String(v||'').normalize('NFKC').toLowerCase()
 .replace(/(?:미국|국제|美)?\s*면역\s*항암\s*학회|society\s+for\s+immunotherapy\s+of\s+cancer/g,' sitc ');
const followup=/임상\s*(?:제\s*)?[123]\s*상|유효성|안전성|통계적\s*유의|생존율|반응률|(?:추가|신규|후속|최종|중간)\s*(?:연구|분석|임상|결과)|승인|허가|수주|계약|해지|취소|정정|매출|영업이익/;
function profile(item) {
 const title=norm(item.title),body=title+' '+norm(item.description);
 const stamp=Number(item.pub_ms??item.publishedAt);
 if(!Number.isFinite(stamp)||!/공동\s*(?:연구|으로\s*진행한\s*연구)/.test(body)||
    !/발표|공개|참가|참여/.test(title))return null;
 const count=body.match(/연구(?:\s*(?:결과|성과|논문|초록))?\s*(\d+)\s*(?:건|편)/)?.[1];
 if(!count)return null;
 const meetings=new Set(body.match(/[가-힣]{2,25}(?:학회|학술회)/g)||[]);
 if(/\bsitc\b/.test(body))meetings.add('sitc');
 if(!meetings.size)return null;
 const year=body.match(/\b(20\d{2})\b/)?.[1]||String(new Date(stamp+9*3600000).getUTCFullYear());
 const edition=body.match(/제\s*(\d+)\s*(?:회|차)/)?.[1]||'';
 return {stamp,meetings,count,year,edition,followup:followup.test(title)};
}
export function researchConferenceRelation(a,b) {
 if(a.ticker!==b.ticker)return null;
 const x=profile(a),y=profile(b);if(!x||!y)return null;
 if(Math.abs(x.stamp-y.stamp)>3*DAY)return false;
 if(![...x.meetings].some(m=>y.meetings.has(m)))return false;
 if(x.year!==y.year||x.count!==y.count||
    (x.edition&&y.edition&&x.edition!==y.edition))return false;
 if(x.followup||y.followup)return false;
 return true;
}
