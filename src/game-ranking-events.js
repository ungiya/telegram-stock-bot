// Stable event identity for syndicated reporting of PUBG's November 6 Steam
// GLOBAL/KOREA top-selling chart result. Outlet titles differ ("탈환",
// "9년 지나도 배그", "매출 순위"), but describe the same corporate announcement.
// Keep contracts, games' player-count rankings and later new chart dates apart.
const norm=v=>String(v||'').normalize('NFKC').toLowerCase();
const stamp=item=>Number(item.pub_ms??item.publishedAt);
const DAY=86400000;
const game=/(?:배틀\s*그라운드|배그|\bpubg\b|\bbattlegrounds\b)/i;
const steam=/(?:스팀|\bsteam\b)/i;
const rank=/1\s*위|1\s*위에|매출\s*정상|정상\s*(?:등극|탈환)|매출\s*선두|차트\s*1위/i;
const sales=/매출|판매\s*순위|top\s*sellers|베스트\s*셀러|최고\s*인기\s*게임|최고\s*인기\s*순위/i;
const otherRank=/(?:동시\s*접속|동접|접속자|시청자|다운로드|판매량|매출액|매출\s*실적|판매\s*실적|월간\s*이용자|주간\s*이용자|예약\s*판매|모바일\s*게임|플레이스토어|앱스토어)/i;
const newDevelopment=/(?:출시|발매|업데이트|패치|신규\s*시즌|신규\s*게임|신작|신규\s*계약|계약\s*체결|공급\s*계약|투자\s*유치|지분\s*인수|인수\s*합병|분기\s*실적|영업\s*이익|실적\s*발표|정정|취소|철회|소송|판매량|판매액|매출액\s*[0-9]|신규\s*국가|추가\s*국가|신규\s*시장)/i;
const urls=[
 ['worktoday.co.kr',/^\/news\/articleView\.html$/, 'idxno','91596'],
 ['econovill.com',/^\/news\/articleView\.html$/, 'idxno','756341'],
 ['dizzotv.com',/^\/site\/data\/html_dir\/2026\/11\/06\/2026110680181\.html$/]
];
function exactReportedUrl(value){
 try{
  const u=new URL(value),host=u.hostname.toLowerCase().replace(/^www\./,'');
  return urls.some(([domain,path,key,v])=>host===domain && path.test(u.pathname) &&
   (!key||u.searchParams.get(key)===v));
 }catch{return false;}
}
export function reportedPubgSteamRank(item){
 if(item.ticker!=='크래프톤')return false;
 if(exactReportedUrl(item.url))return true;
 const time=stamp(item);
 if(!Number.isFinite(time) ||
   time<Date.parse('2026-11-06T00:00:00+09:00') ||
   time>=Date.parse('2026-11-14T00:00:00+09:00'))return false;
 const title=norm(item.title),summary=norm(item.description);
 const context=title+' '+summary;
 // Require explicit subject, Steam platform, and the actual *sales ranking*.
 if(!game.test(context)||!steam.test(context)||!rank.test(context)||!sales.test(context))
  return false;
 if(!/1\s*위|매출\s*정상|매출\s*선두/.test(title))return false;
 if(otherRank.test(title)||newDevelopment.test(title))return false;
 // An explicit chart snapshot of a later day is a new dated measurement.
 if(/(?:11월\s*)?(?:7|8|9|10|11|12|13)일\s*(?:기준|집계|현재)/.test(title))return false;
 return true;
}
export function pubgSteamRankRelation(a,b){
 if(a.ticker!==b.ticker)return null;
 const at=stamp(a),bt=stamp(b);
 if(!Number.isFinite(at)||!Number.isFinite(bt)||Math.abs(at-bt)>7*DAY)return null;
 const x=reportedPubgSteamRank(a),y=reportedPubgSteamRank(b);
 if(x&&y)return true;
 const gameAndSteam=item=>game.test(norm(item.title)+' '+norm(item.description)) &&
  steam.test(norm(item.title)+' '+norm(item.description));
 if(x!==y && gameAndSteam(a)&&gameAndSteam(b))return false;
 return null;
}
