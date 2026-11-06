// Generic cross-publisher first-announcement matching for ALL watched companies.
// No ticker names, article URLs, fixed release dates or API/LLM calls.
// Paired with the D1 30-day delivery history/lock in news-delivery.js.
const DAY = 86400000;
const stamp = x => Number(x.pub_ms ?? x.publishedAt);
const normalize = x => String(x || '').normalize('NFKC').toLowerCase()
  .replace(/<[^>]+>/g,' ').replace(/&(?:amp|nbsp);/g,' ')
  .replace(/\[[^\]]{1,50}\]\s*/g,' ')
  .replace(/의과학/g,'의료').replace(/인공지능/g,'ai')
  .replace(/foundation\s*model|파운데이션\s*모델/g,'파운데이션모델')
  .replace(/의료\s*(?:전문|특화|전용)\s*(?:ai|파운데이션모델)/g,'의료특화 파운데이션모델')
  .replace(/기술\s*개발\s*(?:완료|성공)|개발\s*(?:완료|성공)|프로젝트\s*완수/g,'개발완료')
  .replace(/선보(?:였|여|인|였다)|선봬|베일을\s*벗|첫\s*공개/g,'공개')
  .replace(/(?:도입|출시|발표)했다고\s*밝혔다/g,'발표')
  .replace(/(?<=\d),(?=\d)/g,'');

function compact(value,ticker) {
  const company=normalize(ticker).replace(/[^a-z0-9가-힣]/g,'');
  let s=normalize(value).replace(/[^a-z0-9가-힣]/g,'');
  // Do not count the company's name as shared event evidence.
  if(company)s=s.split(company).join('');
  // Common attribution and reporter wording is not an event identity.
  s=s.replace(/(?:사진제공|사진기자|보도자료제공|무단전재|재배포금지)/g,'');
  return s.slice(0,850);
}
function shingles(str,length=8) {
  const result=new Set();
  for(let i=0;i+length<=str.length;i++) result.add(str.slice(i,i+length));
  return result;
}
function subjectEvidence(a,b) {
  // Two matching 8-character shingles (overlap >=9 chars) or a matching
  // 11-character phrase identifies a concrete topic beyond "AI", "company".
  const a8=shingles(a,8), b8=shingles(b,8);
  const common=[...a8].filter(x=>b8.has(x) &&
    !/^(?:기업|회사|당사는|해당기업|시장확대|사업강화|관계자|세계최초|세계최대|기술개발|기술력을|사업영역)/.test(x));
  if(common.length<3)return false;
  const a11=shingles(a,11),b11=shingles(b,11);
  return [...a11].some(x=>b11.has(x)) || common.length>=6;
}
function versioned(value) {
  const title=normalize(value);
  return [...title.matchAll(/([a-z가-힣]{2,24})\s*(\d+)\s*[.]\s*(\d+)(?!\d)/g)]
    .map(m=>m[1].replace(/[^a-z가-힣]/g,'')+':'+m[2]+'.'+m[3])
    .filter(x=>!x.startsWith('분기:'));
}
function incompatibleVersions(a,b) {
  const av=versioned(a.title),bv=versioned(b.title);
  if(av.length && bv.length && !av.some(x=>bv.includes(x))) return true;
  // If a follow-up headline explicitly changes version (e.g. 2.1),
  // it should not match a title with version 2.0 even if its lead recalls 2.0.
  return false;
}
const changed = /(?:신규|추가|후속|별도|새로운|차세대)\s*(?:계약|공급|기능|버전|모델|제품|국가|고객|프로젝트|출시|도입|투자)|(?:공급|판매|수출|기술이전|독점|라이선스)\s*계약|계약\s*(?:체결|해지|취소)|(?:신규|첫|추가)\s*(?:공급|도입|수주)|(?:임상|시험)\s*[123]\s*상|(?:독립|추가|신규)\s*(?:임상|실증|검증|벤치마크)|(?:임상|벤치마크)\s*(?:결과|성과)|(?:정확도|민감도|특이도)\s*(?:\d+|결과|향상|개선)|(?:식약처|fda|ce)\s*(?:허가|승인)|(?:매출|영업이익|순이익|손익|실적|판매량|판매액|수주액|영업손실)\s*(?:\d|발표|증가|감소|돌파|기록|집계)|(?:실적|매출|판매|출시|도입|사업)\s*(?:성과|결과)|정정|취소|철회|중단|회수|소송|재개|재출시|리뉴얼|업데이트|패치|특허\s*(?:등록|취득)|논문\s*(?:게재|발표)|상장|ipo|인수합병|합병/i;
const initial = /공개|선보|발표|개발\s*(?:완료|성공|완수)|개발완료|완성|완수|첫\s*선보|소개|시연|실증\s*완료|프로젝트\s*(?:완료|완수)|모델\s*(?:구축|개발)|오픈\s*소스|오픈소스/i;
const subjectType = /(?:ai|의료|인공지능|과학|파운데이션|모델|플랫폼|솔루션|시스템|기술|제품|서비스|로봇|배터리|반도체|전력망|클라우드|게임|인프라|프로젝트|소프트웨어|연구|알고리즘)/i;
const vague = /^(?:[a-z0-9가-힣]+)?(?:사업확대|시장공략|경쟁력강화|성장전략|고객만족|업계최초|세계최초|혁신기술|글로벌시장)(?:[a-z0-9가-힣]+)?$/;

export function crossPublisherAnnouncementRelation(a,b) {
  if(!a.ticker||a.ticker!==b.ticker)return null;
  const at=stamp(a),bt=stamp(b);
  if(!Number.isFinite(at)||!Number.isFinite(bt)||Math.abs(at-bt)>7*DAY)return null;
  const ta=normalize(a.title),tb=normalize(b.title);
  // Avoid merging genuinely new events that quote a former launch in the body.
  if(changed.test(ta)||changed.test(tb))return null;
  if(incompatibleVersions(a,b))return false;
  const da=normalize(a.description).slice(0,520);
  const db=normalize(b.description).slice(0,520);
  // Both must actually describe the first introduction/development milestone.
  // The title may be truncated by the search index, so permit the lead to
  // supply the missing "공개/선보" verb when the title names the topic.
  if(!(initial.test(ta)||initial.test(da))||
     !(initial.test(tb)||initial.test(db)))return null;
  if(!subjectType.test(ta+' '+da)||!subjectType.test(tb+' '+db))return null;
  // Insufficient abstracts: protect against "same company + generic AI".
  if(da.length<32||db.length<32)return null;
  const na=compact(ta+' '+da,a.ticker),nb=compact(tb+' '+db,b.ticker);
  if(na.length<55||nb.length<55)return null;
  if(!subjectEvidence(na,nb))return null;
  // A distinctive topic must be present in the TITLE of at least one item
  // and in the other item's press-release lead. Similar footers alone are not
  // evidence that the story is the same.
  const atitle=compact(ta,a.ticker),btitle=compact(tb,b.ticker);
  const across=(subjectEvidence(atitle,nb)||subjectEvidence(btitle,na));
  if(!across) {
    // Strong identical core concepts in independent press summaries may be
    // enough when the headlines describe the same type of initial release.
    const ad=compact(da,a.ticker),bd=compact(db,b.ticker);
    if(!subjectEvidence(ad,bd))return null;
    // Use shared *specific subject phrases*, not a fixed catalog of
    // company names or industries. A publisher may omit the model's brand
    // from its headline but describe the same technology in the excerpt.
    const topics=/(모델|기술|솔루션|플랫폼|시스템|제품|프로젝트|의료|배터리|로봇|임상|진단|인증|전시|콘텐츠|서버|엔진|전력|신약|반도체|파운데이션|관리)/;
    const bland=/(사업을확대|시장에진출|기업이개발|기업이공개|관계자는|기술을통해|계획이라고|따라진행|공개했다고|발표했다고|사업을추진)/;
    const b9=shingles(bd,9);
    if(![...shingles(ad,9)].some(p=>b9.has(p)&&topics.test(p)&&!bland.test(p)) ||
       vague.test(atitle)||vague.test(btitle))return null;
  }
  return true;
}
