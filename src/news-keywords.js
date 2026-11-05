// Short-lived, stronger suppression using specific headline terms plus lead evidence.
const norm=v=>String(v||'').normalize('NFKC').toLowerCase().replace(/(?<![가-힣])([가-힣]{2})[·ㆍ]([가-힣]{2}암)/g,'$1암 $2');
const generic=/^(글로벌|기업들?|파트너|파트너사|인공지능|기술력|가능성|활용|진단기업|공동연구|연구성과|분석결과|연구결과|치료반응|치료|예측|성과|결과|공개|발표|분석|연구|개발|사업|시장|공략|확대|강화|국내|해외|미국|한국|기자|뉴스|사진|제공|통해|위해|위한|이번|지난|올해|내년|기술|솔루션|플랫폼|서비스|콘텐츠|업데이트|임상시험|임상|시험|최초|최대|참가|전시|학회|국제|공동|진행|활용한|진행한|밝혔다|가능|기업과|손잡고)$/;
const changed=/정정|해지|취소|철회|중단|실패|소송|승인|허가|계약|수주|매출|영업이익|순이익|실적|임상\s*[123]\s*상|추가|후속|신규|최종|중간|재발|복구|패치|피해\s*규모/;
function words(value,ticker){
 return new Set((norm(value).split(norm(ticker)).join(' ').match(/[가-힣]{2,}|[a-z][a-z0-9-]{2,}/g)||[])
 .map(w=>w.replace(/(?:에서는|으로|에서|들과|과의|와의|에게|까지|부터|은|는|을|를|이|가|의|에|와|과)$/,''))
 .filter(w=>w.length>=3&&!generic.test(w)));
}
export function sharedNewsKeywords(a,b){
 if(a.ticker!==b.ticker||!a.ticker)return false;
 const delta=Math.abs(Number(a.pub_ms??a.publishedAt)-Number(b.pub_ms??b.publishedAt));
 if(!Number.isFinite(delta)||delta>86400000)return false;
 if(changed.test(a.title)||changed.test(b.title))return false;
 const at=words(a.title,a.ticker),bt=words(b.title,b.ticker);
 const shared=[...at].filter(w=>bt.has(w));
 if(!shared.length)return false;
 const ad=words(a.description,a.ticker),bd=words(b.description,b.ticker);
 // Two concrete headline terms, or one supported by two lead terms. Bare
 // company+AI, generic "global" language, and missing excerpts are insufficient.
 const corroboration=[...ad].filter(w=>bd.has(w));
 return shared.length>=2||
        (shared.length===1&&corroboration.length>=2&&ad.has(shared[0])&&bd.has(shared[0]));
}
