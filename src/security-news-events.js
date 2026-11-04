// Compare one product's reported security incident across publisher rewrites.
const text=v=>String(v||'').normalize('NFKC').toLowerCase();
const breach=/해킹|악성\s*코드|악성\s*프로그램|멀웨어|침해|변조|랜섬웨어|보안\s*사고/;
function profile(item) {
 const title=text(item.title),body=title+' '+text(item.description),stamp=Number(item.pub_ms??item.publishedAt);
 if(!breach.test(title)||!Number.isFinite(stamp))return null;
 const names=[...body.matchAll(/['"“‘]([^'"”’\n]{2,90})['"”’]/g)]
  .map(m=>m[1].replace(/[^\p{L}\p{N}]/gu,''))
  .filter(s=>s.length>=2&&!/공식|악성|해킹|프로그램|홈페이지|피해|보안|의혹|침해|^(pc|게임|사고|배포망)$/.test(s));
 if(!names.length)return null;
 const channel=/\bpc\b|런처|실행\s*프로그램|설치\s*파일|배포\s*(?:파일|망)|cdn|콘텐츠전송네트워크/.test(body)?'distribution':
  /개인\s*정보|고객\s*정보|계정\s*정보|데이터\s*유출/.test(body)?'data':'';
 if(!channel)return null;
 let phase='initial';
 if(/공식.{0,8}(?:확인|인정)|(?:조사|수사)\s*결과|공식\s*발표/.test(title))phase='confirmation';
 if(/복구|패치|조치\s*완료|배포\s*중단|서비스\s*재개|해결|사과|보상/.test(title))phase='response';
 if(/(?:피해|유출).{0,10}\d+\s*(?:만|천)?\s*(?:명|건|계정)|피해\s*규모/.test(title))phase='impact';
 if(/재발|또다시|추가\s*(?:해킹|침해|유출|공격)|새로운\s*공격/.test(title))phase='new-incident';
 return {names,channel,phase,stamp};
}
export function securityIncidentRelation(a,b) {
 if(a.ticker!==b.ticker)return null;
 const aa=profile(a),bb=profile(b);
 if(!aa||!bb)return null;
 const sameProduct=aa.names.some(x=>bb.names.some(y=>x===y ||
   (Math.min(x.length,y.length)>=2 && (x.endsWith(y)||y.endsWith(x)))));
 if(!sameProduct||aa.channel!==bb.channel)return false;
 if(Math.abs(aa.stamp-bb.stamp)>3*86400000)return null;
 if(aa.phase!==bb.phase)return false;
 // Later confirmation, remediation and impact reports may contain new facts.
 return aa.phase==='initial'?true:null;
}
