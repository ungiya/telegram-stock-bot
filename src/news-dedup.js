import { reportedPubgSteamRank, pubgSteamRankRelation } from './game-ranking-events.js';
import { crossPublisherAnnouncementRelation } from './cross-publisher-announcements.js';
import { reportedLunitLearningUnit20, learningUnitReleaseRelation } from './foundation-model-events.js';
import { sharedNewsKeywords } from './news-keywords.js';
import { gameCollaborationRelation } from './game-collaboration-events.js';
import { researchConferenceRelation } from './research-conference-events.js';
import { technologyTransferRelation } from './technology-transfer-events.js';
import { securityIncidentRelation } from './security-news-events.js';
import { platformLaunchRelation } from './platform-launch-events.js';
import { commonEventRelation } from './common-news-events.js';

function medicubeCanadaEntry(item) {
  if(!['에이피알','APR','에이피알(APR)'].includes(item.ticker))return null;
  const title=String(item.title||'').normalize('NFKC').toLowerCase();
  const body=title+' '+String(item.description||'').normalize('NFKC').toLowerCase();
  if(!/메디큐브|medicube/.test(body)||!/캐나다|canada/.test(body)||
     !(/입점/.test(body)||(/시장|공략|유통|판로/.test(title)&&/샤퍼스|쇼퍼스|shoppers?/.test(title)))||!/샤퍼스|쇼퍼스|shoppers?\s*drug\s*mart|최대\s*(?:규모\s*)?드럭\s*스토어/.test(body))return null;
  if(/추가\s*입점|입점\s*(?:확대|성과|취소|철회)|매출|판매량|판매액|실적|정정/.test(title))return null;
  const time=Number(item.pub_ms??item.publishedAt);
  if(!Number.isFinite(time))return null;
  const count=body.replace(/(?<=\d),(?=\d)/g,'').match(/(\d+)\s*개\s*(?:전\s*)?매장/);
  return {time,count:count?Number(count[1]):null};
}

function usedQuarter(item) {
  if(item.ticker!=='무신사')return null;
  const title=String(item.title||'').normalize('NFKC');
  const body=title+' '+String(item.description||'').normalize('NFKC');
  if(!/유즈드|musinsa\s*used/i.test(body)||!/거래액/.test(title)||
    /정정|취소|전망|예상|목표/.test(title))return null;
  const q=body.match(/([1-4])\s*분기/);
  const growth=body.match(/(\d+(?:\.\d+)?)\s*%/);
  const stamp=Number(item.pub_ms??item.publishedAt);
  if(!q||!growth||!Number.isFinite(stamp))return null;
  const year=body.match(/(20\d{2})\s*년/)?.[1]||
    String(new Date(stamp+9*3600000).getUTCFullYear());
  return {quarter:q[1],growth:Number(growth[1]),year,stamp};
}
import { rdDayRelation, reportedDndRdDay } from './rd-day-events.js';
import { buybackRelation, reportedKraftonBuyback } from './buyback-events.js';
import { gstarProgramRelation, reportedKraftonGstarBriefing } from './expo-events.js';
import { icoobSeersIntegration, integrationRelation } from './integration-events.js';
import { outlookRelation } from './outlook-events.js';
import { earningsRelation, reportedAlteogenQ3 } from './earnings-events.js';
import { laborRelation, reportedHyosungStrikeNotice } from './labor-events.js';
import { conferenceRelation, reportedPharmGynCongress } from './conference-events.js';
import { personnelRelation, reportedSkPersonnel } from './personnel-events.js';
import { clinicalRelation } from './clinical-events.js';
import { assetTransferRelation } from './asset-transfer-events.js';
// Compare recent stories locally, without paid services or extra HTTP requests.
function text(value, ticker) {
  let result = String(value || '').normalize('NFKC').toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ').replace(/\S+@\S+/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/pharma\s*research\s+global\s+symposium|\bpgs\b|글로벌\s*심포지[엄움]/gi, '글로벌심포지엄')
    .replace(/ls\s*(?:일렉트릭|electric)/g, 'ls일렉트릭')
    .replace(/직류\s*\(\s*dc\s*\)|\bdc\b/g, '직류')
    .replace(/인공지능/g, 'ai').replace(/데이터\s*센터/g, '데이터센터')
    .replace(/업무\s*협약|전략적\s*파트너십|파트너십|맞손|손잡(?:았다|는다|고|아)|협력/g, '협약');
  if (ticker) result = result.split(ticker.toLowerCase()).join(' ');
  return result.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
function grams(value) {
  const compact = value.replace(/\s/g, '');
  return new Set(Array.from({ length: Math.max(0, compact.length - 1) }, (_, i) => compact.slice(i, i + 2)));
}
function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  let count = 0;
  for (const word of a) if (b.has(word)) count++;
  return 2 * count / (a.size + b.size);
}
function keywords(value) {
  return new Set(value.split(' ').map(word => word.replace(/(으로|에서|과|와|의|은|는|이|가|을|를)$/u, ''))
    .filter(word => word.length >= 2 && !/^\d+$/.test(word) && !/^(단독|기자|뉴스|협약|공략|추진|발표|체결|공급계약|계약|공급)$/.test(word)));
}
// Event-level comparison for all watchlist companies. Specific named entities,
// model versions, and counterparties are more durable than outlet-specific wording.
function eventAnchors(value, ticker = '') {
  // A company's own name is shared by every headline and is NOT evidence of the same event.
  const withoutTicker = String(value || '').normalize('NFKC').toLowerCase()
    .split(String(ticker || '').normalize('NFKC').toLowerCase()).join(' ');
  const normalized = withoutTicker
    .replace(/(?:루디|ludi|rudi)\s*(\d+[.]\d+)/g, (_,version) => 'ludi'+version)
    .replace(/ls\s*(?:electric|일렉트릭)/g, 'ls일렉트릭')
    .replace(/인공지능/g, 'ai')
    .replace(/직류/g, 'dc')
    .replace(/업무협약|파트너십|맞손|손잡았다/g, '협력');
  const stop = /^(기업|회사|관련|국내|해외|글로벌|시장|사업|기술|발표|공개|추진|확대|강화|성장|투자|새로운|소식|계획|기자|산업|오늘|올해|지난|이번|본격|최초|세계|한국|미국|기반|개발|기업들|전략|협력|인공지능|ai|모델|공급|서비스|데이터|매출|실적)$/;
  return new Set((normalized.match(/[a-z]+\d+(?:[.]\d+)?|[a-z]{3,}|[가-힣]{2,}/g) || [])
    .filter(token => token.length >= 3 && !stop.test(token)));
}
function eventAction(value) {
  const t = String(value || '');
  if (/해지|철회|취소|중단|결렬/.test(t)) return 'cancel';
  if (/부인|사실무근|정정/.test(t)) return 'correction';
  if (/실적|영업이익|순이익|매출|흑자|적자/.test(t)) return 'earnings';
  if (/수주|공급\s*계약|납품|계약\s*체결/.test(t)) return 'contract';
  if (/인수|합병|지분\s*매각|투자\s*유치/.test(t)) return 'capital';
  if (/출시|공개|발표|시연|선보|선봬|개발|공식화|상용화|론칭|런칭|개시|서비스\s*시작|서비스\s*오픈/.test(t)) return 'announcement';
  if (/협력|협약|파트너십|제휴|맞손/.test(t)) return 'partnership';
  return '';
}
// A distinctive product/service name can appear in substantially different
// headlines and excerpts. Only link launches of the same named product, never
// unrelated announcements merely because the company and "AI" match.
function productLaunchRelation(a,b) {
  if (eventAction(a.title) !== 'announcement' || eventAction(b.title) !== 'announcement') return false;
  const aTime = Number(a.pub_ms ?? a.publishedAt);
  const bTime = Number(b.pub_ms ?? b.publishedAt);
  if (!Number.isFinite(aTime) || !Number.isFinite(bTime) ||
      Math.abs(aTime - bTime) > 7*86400000) return false;
  const aTitle=String(a.title||'').normalize('NFKC'), bTitle=String(b.title||'').normalize('NFKC');
  const differentMilestone=/(?:추가|신규|후속)\s*(?:기능|계약|국가|해외|시장|업데이트|버전|출시)|(?:해외|글로벌|미국|일본|유럽|중국)\s*(?:신규|추가)?\s*출시|(?:출시|공개)\s*(?:성과|후속)/i;
  if (differentMilestone.test(aTitle) || differentMilestone.test(bTitle)) return false;
  const key = value => {
    const withoutTicker=value.toLowerCase().split(String(a.ticker||'').toLowerCase()).join(' ');
    const english=(withoutTicker.match(/\b[a-z][a-z0-9.-]{3,19}\b/gi)||[])
      .map(x=>x.toLowerCase()).filter(x=>!['kpop','k-pop','pubg','medicube','openai','korea','global','chatgpt','apple','google','meta','news','game','games','stock','krafton','electric','industry','release','launch','cloud','north','america','fifty','system'].includes(x));
    const quoted=[...withoutTicker.matchAll(/['"“‘]([가-힣]{2,12})['"”’]/g)].map(m=>m[1]);
    return new Set([...english,...quoted]);
  };
  const aa=key(aTitle),bb=key(bTitle);
  const shared=[...aa].filter(v=>bb.has(v));
  if (!shared.length) return false;
  // Separate product generations, expansions, and milestone counts.
  const revision = title=>[...(title.match(/\b\d+(?:\.\d+)?\b/g)||[])];
  const ar=revision(aTitle),br=revision(bTitle);
  if (ar.length && br.length && ar.every(v=>!br.includes(v))) return false;
  const aWords=eventAnchors(aTitle,a.ticker),bWords=eventAnchors(bTitle,b.ticker);
  const common=[...aWords].filter(v=>bWords.has(v)).length;
  const similarity=overlap(grams(text(aTitle,a.ticker)),grams(text(bTitle,b.ticker)));
  // The product name plus the same launch action and same-week date is a
  // stronger signal than editorial headlines sharing generic business words.
  // Require nontrivial contextual overlap so unrelated features do not merge.
  return common >= 2 || similarity >= 0.45 ||
    (shared.length > 0 && similarity >= 0.22 && Math.abs(aTime-bTime) <= 3*86400000);
}

function matchingEvent(a, b) {
  const aa = eventAnchors(a.title, a.ticker), bb = eventAnchors(b.title, b.ticker);
  const common = [...aa].filter(v => bb.has(v));
  const longer = common.filter(v => v.length >= 4 || /\d/.test(v));
  const actionA = eventAction(a.title), actionB = eventAction(b.title);
  // Require strong subject anchors, not just a shared company name or buzzword.
  if (!longer.length || common.length < 2 || !actionA || !actionB) return false;
  if (actionA !== actionB && !(['announcement','partnership'].includes(actionA) && ['announcement','partnership'].includes(actionB))) return false;
  const salientA = [...aa].filter(v => /\d/.test(v) || v.length >= 5);
  const salientB = [...bb].filter(v => /\d/.test(v) || v.length >= 5);
  if (salientA.some(v => /\d/.test(v)) && salientB.some(v => /\d/.test(v))
      && !salientA.filter(v => /\d/.test(v)).some(v => salientB.includes(v))) return false;
  return common.length >= 3 || (common.length >= 2 && longer.length >= 2);
}

// Compare numbers within their meaning, rather than treating an incidental day
// in one headline and an amount in the other as conflicting facts.
function facts(value) {
  const groups = new Map();
  const s = String(value || '').normalize('NFKC').replace(/(?<=\d),(?=\d)/g, '');
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(조\s*원|억\s*원|만\s*원|원|%|분기|년|월)/g)) {
    const unit = m[2].replace(/\s/g, '');
    let number = Number(m[1]), category = unit;
    if (unit.endsWith('원')) {
      number *= ({'조원':1e12,'억원':1e8,'만원':1e4,'원':1})[unit]; category = 'amount';
    }
    if (!groups.has(category)) groups.set(category, new Set());
    groups.get(category).add(number);
  }
  return groups;
}
function conflictingFacts(a, b, allowed = null) {
  const af = facts(a), bf = facts(b);
  for (const [unit, numbers] of af) {
    if (allowed && !allowed.has(unit)) continue;
    const other = bf.get(unit);
    if (other && ![...numbers].some(n => other.has(n))) return true;
  }
  return false;
}
function eventFlags(value) {
  return [ /해지|철회|취소|중단|결렬/, /적자\s*전환|적자전환/, /흑자\s*전환|흑자전환/, /부인|사실무근/, /정정/, /(?:누적|달성|돌파)/ ]
    .map(pattern => pattern.test(value));
}
// All-company press-release matching uses the lead paragraph as well as the
// headline. Publisher rewrites need not retain the same headline keywords.
function samePressRelease(a, b) {
  const timeA = Number(a.pub_ms ?? a.publishedAt), timeB = Number(b.pub_ms ?? b.publishedAt);
  if (!Number.isFinite(timeA) || !Number.isFinite(timeB) || Math.abs(timeA-timeB) > 7*86400000) return false;
  const leadA = text(a.description, a.ticker).slice(0, 400);
  const leadB = text(b.description, b.ticker).slice(0, 400);
  if (Math.min(leadA.length, leadB.length) < 45) return false;
  // Concrete progress is not another outlet's copy of the earlier announcement.
  const followup = /취소|철회|해지|정정|부인|소송|(?:추가|후속|신규)\s*(?:계약|투자|기능|국가)|실적|영업이익|순이익|누적|달성|돌파/;
  if (followup.test(a.title) || followup.test(b.title)) return false;
  const action = item => eventAction(item.title) || eventAction(item.description) ||
    (/행사|개최|모집|접수|페스티벌|박람회/.test(item.title+' '+item.description) ? 'event' : '');
  const actionA = action(a), actionB = action(b);
  if (!actionA || actionA !== actionB) return false;
  const tokens = value => new Set([...keywords(text(value,a.ticker))]
    .filter(w => w.length >= 3 && !/^(플랫폼|서비스|글로벌|대표|밝혔다|진행한다|개최한다|제공한다|통해|위한|기반|예정이다|있다고|있다)$/.test(w)));
  const allA = tokens(a.title+' '+a.description), allB = tokens(b.title+' '+b.description);
  const shared = [...allA].filter(w => allB.has(w));
  const titleA = tokens(a.title), titleB = tokens(b.title);
  const headlineEvidence = new Set([...titleA].filter(w => allB.has(w)).concat([...titleB].filter(w => allA.has(w))));
  // Shared company boilerplate alone cannot collapse unrelated announcements.
  if (shared.length < 4 || headlineEvidence.size < 2) return false;
  const ag=grams(leadA), bg=grams(leadB);
  const intersection=[...ag].filter(g=>bg.has(g)).length;
  return overlap(ag,bg) >= 0.58 || intersection/Math.min(ag.size,bg.size) >= 0.86;
}

export function sameNews(a, b) {
  const ca=medicubeCanadaEntry(a),cb=medicubeCanadaEntry(b);
  if(ca&&cb) return Math.abs(ca.time-cb.time)<=7*86400000 &&
    !(ca.count&&cb.count&&ca.count!==cb.count);

  const ua=usedQuarter(a),ub=usedQuarter(b);
  if(ua&&ub) return ua.year===ub.year && ua.quarter===ub.quarter &&
    ua.growth===ub.growth && Math.abs(ua.stamp-ub.stamp)<=7*86400000;

  if (a.ticker !== b.ticker) return false;
  const gameCollaboration=gameCollaborationRelation(a,b);
  if(gameCollaboration !== null)return gameCollaboration;
  const steamRank=pubgSteamRankRelation(a,b);
  if(steamRank!==null)return steamRank;
  const researchConference=researchConferenceRelation(a,b);
  if(researchConference !== null)return researchConference;
  const technologyTransfer=technologyTransferRelation(a,b);
  if(technologyTransfer !== null)return technologyTransfer;
  const security=securityIncidentRelation(a,b);
  if(security !== null)return security;
  const platformLaunch=platformLaunchRelation(a,b);
  if(platformLaunch !== null)return platformLaunch;
  const foundation=learningUnitReleaseRelation(a,b);
  if(foundation !== null)return foundation;
  const common=commonEventRelation(a,b);
  if(common !== null) return common;
  const at = text(a.title, a.ticker), bt = text(b.title, b.ticker);
  if (!at || !bt) return false;
  const rdDay = rdDayRelation(a,b);
  if (rdDay !== null) return rdDay;
  const buyback = buybackRelation(a,b);
  if (buyback !== null) return buyback;
  const personnel = personnelRelation(a,b);
  if (personnel !== null) return personnel;
  const transferred = assetTransferRelation(a, b);
  if (transferred !== null) return transferred;
  const labor = laborRelation(a,b);
  if (labor !== null) return labor;
  const integrated = integrationRelation(a,b);
  if (integrated !== null) return integrated;
  const expo = gstarProgramRelation(a,b);
  if (expo !== null) return expo;
  // Group financial results by the actual fiscal period, before the generic
  // amount-conflict and 'milestone' checks compare publisher-specific metrics.
  const earnings = earningsRelation(a,b);
  if (earnings !== null) return earnings;
  if (conflictingFacts(a.title, b.title)) return false;
  const aFlags = eventFlags(a.title), bFlags = eventFlags(b.title);
  if (aFlags.some((flag, i) => flag !== bFlags[i])) return false;
  const clinical = clinicalRelation(a, b);
  if (clinical !== null) return clinical;
  const conference = conferenceRelation(a,b);
  if (conference !== null) return conference;
  // Company-agnostic fallback runs only after the precise event-specific
  // comparators, so R&D days and exhibitions keep their own semantics.
  const crossPublisher=crossPublisherAnnouncementRelation(a,b);
  if(crossPublisher !== null)return crossPublisher;
  // Incidental dates and unrelated endpoints in summaries do not identify a new event.
  // Material financial amounts and reporting-quarter changes still do.
  if (conflictingFacts(a.description, b.description, new Set(['amount', '분기']))) return false;
  if (sharedNewsKeywords(a,b)) return true;
  if (at === bt) return true;
  const outlook = outlookRelation(a,b);
  if (outlook !== null) return outlook;
  if (matchingEvent(a, b)) return true;
  if (productLaunchRelation(a,b)) return true;
  if (samePressRelease(a,b)) return true;
  const titleSimilarity = overlap(grams(at), grams(bt));
  const ad = text(a.description, a.ticker), bd = text(b.description, b.ticker);
  if (Math.min(at.length, bt.length) >= 12 && titleSimilarity >= 0.87) return true;
  if (Math.min(ad.length, bd.length) < 25) return false;
  const summarySimilarity = overlap(grams(ad.slice(0, 400)), grams(bd.slice(0, 400)));
  const ak = keywords(at), bk = keywords(bt);
  const shared = [...ak].filter(word => bk.has(word)).length;
  const ag = grams(ad.slice(0,400)), bg = grams(bd.slice(0,400));
  const contained = Math.min(ag.size,bg.size) >= 35
    && [...ag].filter(g=>bg.has(g)).length / Math.min(ag.size,bg.size) >= 0.9;
  const anchorsA=eventAnchors(a.title,a.ticker), anchorsB=eventAnchors(b.title,b.ticker);
  const meaningful=[...anchorsA].filter(v=>anchorsB.has(v));
  if (contained && meaningful.length >= 2 && titleSimilarity >= 0.25) return true;
  // Different outlets frequently paraphrase the headline and publish unrelated boilerplate excerpts.
  // Require multiple shared informative headline anchors before ignoring excerpt divergence.
  if (shared >= 2 && Math.min(at.length, bt.length) >= 18 && titleSimilarity >= 0.74) return true;
  return (titleSimilarity >= 0.62 && summarySimilarity >= 0.5)
    || (shared >= 3 && titleSimilarity >= 0.32 && summarySimilarity >= 0.48)
    || (shared >= 2 && titleSimilarity >= 0.28 && summarySimilarity >= 0.72)
    || (shared >= 2 && titleSimilarity >= 0.55 && summarySimilarity >= 0.6)
    || (shared >= 1 && titleSimilarity >= 0.3 && Math.min(ad.length,bd.length) >= 40 && summarySimilarity >= 0.9);
}

// The user confirmed repeated delivery of these specific 2026-10-30 events.
// Suppress its syndicated coverage even when the original has aged out of
// history or a publisher supplies a completely different/empty excerpt.
// Date bounds and follow-up exclusions prevent permanent company/person blacklists.

// A confirmed Oct 30/Nov 2 press announcement already delivered to the user.
// Normalize the actual English branding "Ludi", plus the earlier "Rudi" typo.
// Preserve future model releases, contracts, earnings and other real updates.
export function reportedRudiRelease(item) {
  if (item.ticker !== '크래프톤') return false;
  const published = Number(item.pub_ms ?? item.publishedAt);
  if (!Number.isFinite(published) ||
      published < Date.parse('2026-10-29T00:00:00+09:00') ||
      published >= Date.parse('2026-11-16T00:00:00+09:00')) return false;
  const title = String(item.title || '').normalize('NFKC').toLowerCase();
  const description = String(item.description || '').normalize('NFKC').toLowerCase();
  const body = title + ' ' + description;
  // A future release/version or a new material milestone is not a repeat.
  const followup = /(?:루디|ludi|rudi)\s*(?:0[.]3|1[.]0|2[.]0)|(?:신규|추가|새로운)\s*(?:계약|투자|공급)|계약\s*체결|수주|양산|상용화|정식\s*출시|실적|영업이익|매출|인수합병|지분\s*인수|승인|특허\s*등록|철회|취소|정정|소송/i;
  // "2.0" was a shorthand in discussion, but actual November release is 0.2.
  // Do not suppress a genuine version 2.0 announcement.
  if (followup.test(title)) return false;
  const target = /(?:루디|ludi|rudi)\s*0\s*[.]?\s*2(?!\d)/i;
  if (target.test(title)) return true;
  // A rewritten headline may omit the model number while its article summary
  // still describes exactly this announcement.
  const subject = /루도\s*로보틱스|ludo\s*robotics|로봇(?:용)?\s*(?:인공지능|ai)|사회적\s*지능|로보틱스/i;
  const release = /공개|발표|선보|시연|개발|사회적\s*지능|사람(?:과|의)\s*(?:협력|의도)|손짓|제스처/i;
  return target.test(body) && subject.test(title) && release.test(title);
}

// The November 2 Kiff launch announcement has repeatedly resurfaced across
// outlets and was reported as sent many times, including the exact Daily Post URL.
// Scope this to that launch, not future contracts, earnings or genuine expansions.
export function reportedKiffLaunch(item) {
  if (item.ticker !== '크래프톤') return false;
  try {
    const url = new URL(item.url);
    const host = url.hostname.toLowerCase().replace(/^www\./,'');
    if (host === 'thedailypost.kr' &&
        url.pathname.replace(/\/$/,'') === '/news/articleView.html' &&
        url.searchParams.get('idxno') === '116597') return true;
    // A real-world roundup combines an unrelated game-company item with
    // Krafton's already-reported Kiff launch; URL is already confirmed received.
    if (host === 'sisajon.co.kr' &&
        url.pathname.replace(/\/$/,'') === '/news/articleView.html' &&
        url.searchParams.get('idxno') === '205735') return true;
  } catch { /* Continue to headline-based matching for syndicated stories. */ }
  const published = Number(item.pub_ms ?? item.publishedAt);
  if (!Number.isFinite(published) ||
      published < Date.parse('2026-11-01T00:00:00+09:00') ||
      published >= Date.parse('2026-11-20T00:00:00+09:00')) return false;
  const title = String(item.title || '').normalize('NFKC').toLowerCase();
  // Multi-company roundups may describe a contract or a new milestone for
  // another business before the Krafton Kiff blurb. Only the Krafton section
  // should be inspected for exemption or launch terms.
  const kraftonAt = title.lastIndexOf('크래프톤');
  const itemHeadline = kraftonAt >= 0 ? title.slice(kraftonAt) : title;
  const body = title + ' ' + String(item.description || '').normalize('NFKC').toLowerCase();
  const kiff = /(?:\bkiff\b|키프)/i;
  if (!kiff.test(body)) return false;
  // A genuinely new milestone remains alertable even when it mentions Kiff.
  const development = /수주|공급\s*계약|신규\s*계약|계약\s*체결|투자\s*유치|인수|합병|지분|매출|실적|영업이익|유료\s*가입자|이용자\s*(?:수|증가)|출시\s*성과|매출액|신규\s*국가|해외\s*출시|글로벌\s*(?:\d+\s*개국\s*)?(?:신규\s*)?출시|(?:\d+\s*개국|국가)\s*(?:신규\s*)?출시|확대\s*출시|철회|취소|중단|정정|소송|신규\s*아티스트|추가\s*아티스트|후속\s*출시/.test(itemHeadline);
  if (development) return false;
  const launch = /출시|선보|공개|론칭|런칭|시작|개시|상용화|출범|오픈|서비스\s*(?:개시|시작|출시|공개)|사업\s*확장|시장\s*진출|참전/.test(itemHeadline);
  const topic = /캐릭터|챗|채팅|케이\s*팝|k\s*-?\s*pop|k팝|인공지능|\bai\b|피프티피프티|fifty\s*fifty|웨니/.test(body);
  return launch && topic && (kiff.test(itemHeadline) || /크래프톤/.test(itemHeadline));
}

export function coveredNewsEvent(item) {
  if(reportedPubgSteamRank(item))return 'event:krafton-pubg-steam-sales-1st-2026-11-06';
  if(reportedLunitLearningUnit20(item))return 'event:lunit-learningunit20-foundation-model-launch-2026-11-06';
  const canada=medicubeCanadaEntry(item);
  if(canada && (!canada.count||canada.count===1300) &&
     canada.time>=Date.parse('2026-11-04T00:00:00+09:00') &&
     canada.time<Date.parse('2026-11-11T00:00:00+09:00'))
    return 'event:apr-medicube-canada-shoppers-1300-2026-11-04';

  const used=usedQuarter(item);
  if(used && used.year==='2026' && used.quarter==='3' && used.growth===143 &&
     used.stamp>=Date.parse('2026-11-04T00:00:00+09:00') &&
     used.stamp<Date.parse('2026-11-11T00:00:00+09:00'))
    return 'event:musinsa-used-2026-q3-gmv-143';

  if (reportedDndRdDay(item)) return 'event:dnd-pharmatech-rd-day-2026-11-03';
  if (reportedKraftonBuyback(item)) return 'event:krafton-buyback-3000-cancel-2026-11-03';
  if (reportedKraftonGstarBriefing(item)) return 'event:krafton-gstar-2026-program-briefing-2026-11-03';
  if (icoobSeersIntegration(item)) return 'event:seers-icoob-labconnect-thync-cgm-integration-2026-11-03';
  if (reportedAlteogenQ3(item)) return 'event:alteogen-q3-2026-earnings-release';
  if (reportedHyosungStrikeNotice(item)) return 'event:hyosung-wage-union-first-strike-warning-2026-11-03';
  if (reportedPharmGynCongress(item)) return 'event:pharmaresearch-gyn-congress-22-oct-18-2026';
  if (reportedKiffLaunch(item)) return 'event:krafton-kiff-kpop-ai-chat-launch-2026-11-02';
  if (reportedSkPersonnel(item)) return 'event:sk-innovation-2027-personnel-2026-10-30';
  // This immutable URL was explicitly reported as already received.
  try {
    const url = new URL(item.url);
    if (/^(?:www\.)?viva100\.com$/.test(url.hostname) && url.pathname === '/article/20261102500194')
      return 'event:ls-electric-koo-ai-dc-grid-2026-11-02';
  } catch { /* Fixtures and non-URL items still use content matching below. */ }
  const published = Number(item.pub_ms);
  if (!Number.isFinite(published) || published < Date.parse('2026-10-29T00:00:00+09:00')
    || published >= Date.parse('2026-11-14T00:00:00+09:00')) return null;
  const title = String(item.title || '').normalize('NFKC').toLowerCase();
  const body = title + ' ' + String(item.description || '').normalize('NFKC').toLowerCase();
  if (item.ticker === '크래프톤' && reportedRudiRelease(item))
    return 'event:krafton-rudi-0.2-bars-2026-10-30';
  if (item.ticker === 'LS일렉트릭') {
    const speaker = /구자균/.test(body);
    const ai = /인공지능|\bai\b/.test(body);
    const dc = /직류|\bdc\b/.test(body);
    const grid = /전력망|전력난|전력\s*수요|전력\s*인프라/.test(body);
    const speech = /해법|강조|제언|제시|발언|필요|구축|지능형/.test(body);
    const followup = /수주|공급\s*계약|계약\s*체결|신제품|출시|준공|착공|실적|영업이익|매출|목표주가|투자의견|정정|철회|취소|소송|해임|사임/.test(title);
    return speaker && ai && dc && grid && speech && !followup
      ? 'event:ls-electric-koo-ai-dc-grid-2026-11-02' : null;
  }
  if (item.ticker === '파마리서치') {
    const pgs = /\bpgs\b|pharma\s*research\s+global\s+symposium|글로벌\s*심포지[엄움]/.test(body)
      || (/심포지[엄움]/.test(body) && /강릉|라카이|샌드파인/.test(body));
    // PGS in a background paragraph must not suppress genuinely new financial,
    // regulatory, clinical, product or analyst developments in the headline.
    const followup = /영업이익|순이익|실적|매출|목표\s*주가|투자\s*의견|매수|매도|증권|리포트|임상\s*[123]\s*상|임상\s*(결과|성공|실패)|유효성|품목\s*허가|승인|fda|수주|공급\s*계약|기술\s*(이전|수출)|인수|합병|출시|신제품|소송|취소|중단|정정/.test(title);
    // Do not merge a different year's/edition's symposium into the known event.
    const anotherYear = /20\d{2}/.test(title) && !/2026/.test(title);
    const anotherEdition = /제\s*\d+\s*회/.test(title) && !/제\s*7\s*회/.test(title);
    return pgs && !followup && !anotherYear && !anotherEdition
      ? 'event:pharmaresearch-pgs-2026-10' : null;
  }
  if (item.ticker === '무신사') {
    const person = /김지용|지용킴|jiyong\s*kim/.test(body);
    const appointment = /선임|영입|발탁|임명|합류|품(?:은|었다|다)|새\s*(?:디렉터|cd)/.test(body);
    const role = /크리에이티브\s*디렉터|creative\s*director|\bcd\b/.test(body);
    // Keep new appointments to other roles, departures and actual product launches.
    const followup = /사임|해임|퇴임|퇴사|결별|철회|취소|부인|정정|소송|보직\s*(?:변경|이동)|전보|승진|재선임|대표이사|신임\s*대표|사장|cfo|cto|출시|출점|개점|실적|매출|영업이익|첫\s*컬렉션/.test(title);
    if (person && appointment && !followup && (role || /김지용|지용킴|jiyong\s*kim/.test(title)))
      return 'event:musinsa-jiyongkim-cd-2026-10-30';
    return null;
  }
  if (item.ticker !== '효성중공업') return null;
  if (!/지멘스|siemens/.test(body)) return null;
  // Concrete follow-ups must not be swallowed by the old agreement coverage.
  if (/해지|철회|취소|중단|결렬|부인|사실무근|정정|소송|실적|영업이익|순이익|수주|공급\s*계약|납품|추가\s*(협약|계약)|신규\s*계약|재계약/.test(title)) return null;
  if (/해지|철회|취소|결렬|소송|사실무근/.test(body)) return null;
  if (/\d[\d,.]*\s*(?:조|억|만)\s*원/.test(title)) return null;
  const partnership = /협력|협약|파트너십|맞손|손잡|gspa|제휴|동맹/.test(body)
    || /(?:지멘스|siemens)\s*(?:와|과)/.test(title);
  const scope = /디지털\s*전력|전력망|데이터\s*센터|gspa/.test(body);
  return partnership && scope ? 'event:hyosung-siemens-gspa-2026-10-30' : null;
}
