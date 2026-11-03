// A quarterly earnings announcement is one corporate event even when one
// publisher headlines revenue and another headlines operating profit.
// Separate actual reports from forecasts and corrected/finalized filings.
const DAY = 86400000;
const normalize = value => String(value || '').normalize('NFKC').toLowerCase();
const timestamp = item => Number(item.pub_ms ?? item.publishedAt);
const quarterly = /([1-4])\s*분기|\bq\s*([1-4])\b|\b([1-4])\s*q\b/i;
const earnings = /(?:분기\s*(?:연결\s*)?(?:매출|실적|영업\s*(?:이익|익))|(?:매출(?:액)?|영업\s*(?:이익|익)|순\s*이익|영업손실|당기순이익|영업\s*(?:이익|익)률|실적|매출\s*돌파|매출\s*성장))/i;
const revision = /정정|재공시|수정\s*공시|재작성|수치\s*(?:수정|변경)|(?:최종|확정)\s*(?:실적|집계|공시)|실적\s*(?:확정|정정)|오류\s*수정/i;
const forecast = /전망|예상|추정|관측|컨센서스|가이던스|실적\s*기대|실적\s*전망/i;
const otherEvent = /임상\s*(?:제?\s*[123]\s*상|시험)|fda\s*(?:승인|허가)|품목\s*허가|(?:신규|추가)\s*(?:공급|수출)\s*계약|계약\s*체결|기술\s*(?:수출|이전)\s*(?:계약|체결)|인수\s*합병|소송/i;
const yearPattern = /(20\d{2})\s*년\s*([1-4])\s*분기/;

export function earningsProfile(item) {
  const title=normalize(item.title);
  const body=title+' '+normalize(item.description);
  const date=timestamp(item);
  if (!Number.isFinite(date) || !title || !earnings.test(title)) return null;
  // A report that merely references old earnings in the background is not an
  // earnings event if the headline is a new clinical trial or contract.
  if (otherEvent.test(title)) return null;
  const match=title.match(quarterly) || normalize(item.description).match(quarterly);
  if (!match) return null;
  const quarter=Number(match[1]||match[2]||match[3]);
  const yearInHeadline=title.match(yearPattern);
  const yearInExcerpt=normalize(item.description).match(yearPattern);
  const koreaDate=new Date(date+9*3600000);
  let year=Number(yearInHeadline?.[1] || yearInExcerpt?.[1] || koreaDate.getUTCFullYear());
  // Regular Q4 results usually arrive in January/February of the following year.
  if (!yearInHeadline && !yearInExcerpt && quarter===4 && koreaDate.getUTCMonth() < 2) year--;
  const phase=revision.test(title)?'revision':forecast.test(title)?'forecast':'reported';
  return {ticker:item.ticker,quarter,year,phase,stamp:date};
}

export function earningsRelation(a,b) {
  if(a.ticker!==b.ticker)return null;
  const aa=earningsProfile(a),bb=earningsProfile(b);
  if(!aa||!bb) {
    // A syndicated headline may omit the quarter entirely. Require a reported
    // quarter on one side and the same operating profit, rather than guessing
    // a quarter solely from the publication month.
    const known=aa||bb, missing=aa?b:a;
    if(!known || known.phase!=='reported')return null;
    const title=normalize(missing.title), body=title+' '+normalize(missing.description);
    if(!earnings.test(title) || !/분기/.test(body) || quarterly.test(body) ||
       revision.test(title) || forecast.test(title) || otherEvent.test(title) ||
       /20\d{2}\s*년|지난해|작년/.test(title))return null;
    const stamp=timestamp(missing);
    if(!Number.isFinite(stamp)||Math.abs(stamp-known.stamp)>3*DAY)return null;
    const profit = item => {
      const text=normalize(item.title+' '+(item.description||'')).replace(/(?<=\d),(?=\d)/g,'');
      const m=text.match(/영업\s*(?:이익|익)(?:은|이|으로|도)?\s*(\d+(?:\.\d+)?)\s*억(?:\s*(\d+)\s*만)?/);
      return m?Number(m[1])+Number(m[2]||0)/10000:null;
    };
    const ap=profit(a),bp=profit(b);
    return ap!==null && bp!==null && Math.abs(ap-bp)<=0.1 ? true:null;
  }
  if(aa.year!==bb.year||aa.quarter!==bb.quarter||aa.phase!==bb.phase)return false;
  if(Math.abs(aa.stamp-bb.stamp)>30*DAY)return null;
  // Forecasts (which can evolve daily) are not collapsed by reporting period.
  if(aa.phase!=='reported')return null;
  return true;
}

// Already sent to this Telegram channel from CBCNEWS, Infomax and MTN.
// During the current 2026 Q3 earnings news cycle, suppress the syndicated
// reporting even if older delivery representatives are absent from D1 history.
export function reportedAlteogenQ3(item) {
  if(item.ticker!=='알테오젠')return false;
  try{
    const url=new URL(item.url);
    const host=url.hostname.toLowerCase().replace(/^www\./,'');
    const path=url.pathname.replace(/\/$/,'');
    if((host==='cbci.co.kr' && path==='/news/articleView.html' && url.searchParams.get('idxno')==='622579') ||
       (host==='news.einfomax.co.kr' && path==='/news/articleView.html' && url.searchParams.get('idxno')==='4442737') ||
       (host==='news.mtn.co.kr' && path==='/article/2026110311512133841'))
      return true;
  }catch { /* Still check other publishers' reports by earnings event. */ }
  // Confirmed screenshot: the quarterly revenue headline omits '3분기',
  // but pairs the first 1,000억 revenue milestone with 789억 operating profit.
  const title=normalize(item.title), body=title+' '+normalize(item.description);
  const stamp=timestamp(item);
  const fingerprint=/분기\s*매출/.test(body) && /(?:첫|처음)/.test(body) &&
    /1[,.]?000\s*억/.test(body) && /영업\s*(?:이익|익)(?:은|이)?\s*789\s*억/.test(body);
  if(fingerprint && !quarterly.test(body) && !revision.test(title) &&
     !forecast.test(title) && !otherEvent.test(title) && !/20\d{2}\s*년|지난해|작년/.test(title) &&
     stamp>=Date.parse('2026-11-03T00:00:00+09:00') &&
     stamp<Date.parse('2026-11-07T00:00:00+09:00'))return true;
  const profile=earningsProfile(item);
  if(!profile || profile.year!==2026 || profile.quarter!==3 ||
     profile.phase!=='reported')return false;
  return profile.stamp>=Date.parse('2026-11-01T00:00:00+09:00') &&
         profile.stamp<Date.parse('2026-12-01T00:00:00+09:00');
}
