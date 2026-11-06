// Model-announcement dedup for the already-delivered November 2026 release
// of Lunit's medical foundation model "Learning Unit 2.0" (러닝유닛 2.0).
// Publisher headlines often omit the actual model name and instead say
// "정부 의과학 파운데이션 모델 프로젝트 개발 완료".
// Restrict to the first announcement, not clinical evidence or new contracts.
const norm=v=>String(v||'').normalize('NFKC').toLowerCase();
const timeOf=x=>Number(x.pub_ms??x.publishedAt);
const DAY=86400000;
const modelName=/(?:러닝\s*유닛|learning\s*unit|learningunit)\s*2\s*[.]?\s*0(?!\d)/i;
const namedVersion=/(?:러닝\s*유닛|learning\s*unit|learningunit)\s*(\d+)\s*[.]?\s*(\d+)(?!\d)/ig;
const medicalFoundation=/(?:의과학|의료)\s*특화.{0,28}(?:파운데이션|foundation)\s*모델|(?:파운데이션|foundation)\s*모델.{0,28}(?:의과학|의료)\s*특화/i;
const newMilestone=/(?:임상\s*(?:[123]\s*상|결과|시험|성과)|환자\s*검증\s*결과|독립\s*검증|벤치마크\s*(?:결과|평가\s*결과|성적)|정확도\s*(?:\d|결과|수치|확정)|실증\s*(?:결과|완료|성공)|(?:추가|신규|별도)\s*(?:모델|제품|기능|버전|프로젝트|계약)|(?:공급|판매|수출|기술이전)\s*계약|계약\s*체결|정식\s*(?:출시|상용화)|(?:병원|기관|고객사)\s*(?:공급|도입|구축|계약)|(?:fda|식약처|ce)\s*(?:허가|승인)|(?:특허|논문)\s*(?:등록|게재|발표)|(?:매출|영업이익|분기\s*실적|투자유치|유상증자|인수합병|취소|철회|중단|정정|소송))/i;
const announcement=/(?:공개|개발\s*완료|개발했다|완성|완수|선보|발표|구축|개발\s*성공|의료\s*현장.{0,16}실증|모델\s*개발)/i;
const officialProject=/(?:정부|국가\s*전략|과학기술정보통신부|과기정통부|컨소시엄|의과학\s*특화|프로젝트)/i;

const deliveredUrls=[
 ['daily.hankooki.com',/^\/news\/articleView\.html$/,'idxno','1422512'],
 ['etoday.co.kr',/^\/news\/view\/2644883$/]
];

function exactDeliveredUrl(value) {
 try {
  const u=new URL(value);
  const host=u.hostname.toLowerCase().replace(/^www\./,'');
  return deliveredUrls.some(([domain,path,param,id])=>host===domain&&path.test(u.pathname)&&
   (!param||u.searchParams.get(param)===id));
 } catch {return false;}
}

// Dated announcement identity (not a blanket blacklist of the product).
export function reportedLunitLearningUnit20(item) {
 if(item.ticker!=='루닛')return false;
 if(exactDeliveredUrl(item.url))return true;
 const date=timeOf(item);
 if(!Number.isFinite(date)||
    date<Date.parse('2026-11-04T00:00:00+09:00')||
    date>=Date.parse('2026-11-20T00:00:00+09:00'))return false;
 const title=norm(item.title),desc=norm(item.description),body=title+' '+desc;
 if(newMilestone.test(title))return false;
 // A different version (e.g. 2.1 or 3.0) is a new model, even if its summary
 // mentions the older 2.0 announcement as background.
 for(const m of body.matchAll(namedVersion)) {
   if(Number(m[1])!==2||Number(m[2])!==0)return false;
 }
 const hasName=modelName.test(body);
 const hasProject=medicalFoundation.test(body) &&
   officialProject.test(body) && /모델|파운데이션/.test(title);
 if(!hasName && !hasProject)return false;
 if(!announcement.test(title) &&
    !(hasName&&/(의료|인공지능|\bai\b|파운데이션|모델)/i.test(title)))return false;
 // First coverage may describe proposed clinical piloting, not completed
 // clinical trial results. Only the above substantive outcome terms are new.
 return true;
}

// Order this before generic headline numeric or milestone comparisons:
// different newsrooms feature "23개 기관", "4종 벤치마크" or clinical workflow.
export function learningUnitReleaseRelation(a,b) {
 if(a.ticker!==b.ticker)return null;
 const at=timeOf(a),bt=timeOf(b);
 if(!Number.isFinite(at)||!Number.isFinite(bt)||
    Math.abs(at-bt)>7*DAY)return null;
 const aa=reportedLunitLearningUnit20(a),bb=reportedLunitLearningUnit20(b);
 if(aa&&bb)return true;
 if(aa!==bb &&
    ((modelName.test(norm(a.title)+' '+norm(a.description)) &&
      modelName.test(norm(b.title)+' '+norm(b.description))) ||
      (medicalFoundation.test(norm(a.title)+' '+norm(a.description)) &&
       medicalFoundation.test(norm(b.title)+' '+norm(b.description)))))return false;
 return null;
}
