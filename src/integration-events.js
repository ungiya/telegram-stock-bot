// Group coverage of the same named product integration across publishers.
// Do not collapse a partnership agreement with a later deployment, contract,
// regulatory approval, earnings, or actual installation at a named hospital.
const normalize = value => String(value || '').normalize('NFKC').toLowerCase();
const dated = item => Number(item.pub_ms ?? item.publishedAt);
const DAY = 86400000;
const named = /lab\s*connect|랩\s*커넥트|연속\s*혈당|cgm\s*live|thyn\s*c|씽크|입원\s*환자\s*모니터링/i;
const linked = /연동|적용|통합|연계|연결|확장|확대|모은다|결합|탑재|플랫폼|혈당\s*관리/i;
const materialChange = /수주|공급\s*계약|계약\s*체결|신규\s*계약|독점\s*계약|실제\s*도입|첫\s*도입|추가\s*도입|신규\s*(?:병원|고객|수출)|(?:병원|의료기관)\s*(?:도입|계약|공급)|도입\s*(?:완료|확정)|납품|설치\s*완료|매출|영업\s*이익|순이익|분기\s*실적|투자\s*유치|지분|인수|합병|품목\s*허가|(?:fda|식약처)\s*승인|보험\s*수가|유상\s*증자|특허\s*등록|철회|중단|취소|정정|소송|새로운\s*버전|후속\s*제품/i;

export function icoobSeersIntegration(item) {
  if (item.ticker !== '씨어스') return false;
  try {
    const u = new URL(item.url);
    if (u.hostname.toLowerCase().replace(/^www\./, '') === 'thefairnews.co.kr' &&
        u.pathname === '/news/articleView.html' &&
        u.searchParams.get('idxno') === '92899') return true;
  } catch { /* Match syndicated wording if not the exact user-reported URL. */ }

  const when = dated(item);
  // Initial May partnership and any later rollout are separate milestones.
  if (!Number.isFinite(when) ||
      when < Date.parse('2026-11-02T00:00:00+09:00') ||
      when >= Date.parse('2026-11-15T00:00:00+09:00')) return false;

  const title=normalize(item.title), excerpt=normalize(item.description);
  const body=title+' '+excerpt;
  // Only the specific partner/product rollout, not any other Seers news.
  if (!/아이\s*쿱|ikoob|i-?koob/i.test(body)) return false;
  if (!named.test(body) || !linked.test(body)) return false;
  if (materialChange.test(title)) return false;
  // A new named hospital installation is news even if a generic integration
  // press-release summary is repeated in the article.
  return true;
}

// The known November integration should match whichever outlet arrived first,
// even when the two headlines have no common launch/action verbs.
export function integrationRelation(a,b) {
  if (a.ticker !== b.ticker) return null;
  const t1=dated(a),t2=dated(b);
  if(!Number.isFinite(t1)||!Number.isFinite(t2)||
     Math.abs(t1-t2)>7*DAY)return null;
  const aa=icoobSeersIntegration(a),bb=icoobSeersIntegration(b);
  if(aa&&bb)return true;
  if(aa!==bb &&
     (/(아이\s*쿱|ikoob|i-?koob)/i.test(String(a.title)+' '+String(a.description)) &&
      /(아이\s*쿱|ikoob|i-?koob)/i.test(String(b.title)+' '+String(b.description))) &&
     (named.test(String(a.title)+' '+String(a.description))) &&
     (named.test(String(b.title)+' '+String(b.description))) )return false;
  return null;
}
