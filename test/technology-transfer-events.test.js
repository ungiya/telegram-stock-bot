import test from 'node:test';
import assert from 'node:assert/strict';
import {sameNews} from '../src/news-dedup.js';
export const stories=[
 ['한국전력, K-전력진단 기술 민간 사업화 속도…LS일렉트릭에 SEDA 기술이전','자체 개발한 인공지능 기반 전력설비 진단 기술을 민간에 넘긴다. 5일 한국전력에 따르면 회사와 LS일렉트릭은 지난 4일 기술이전 계약을 맺었다. 광주 김대중컨벤션센터에서 열린 빅스포 2026 현장에서 서명했다.'],
 ['370억 아낀 한전 노하우 품는다…LS일렉트릭, 변전설비 예방진단 SEDA 도입','LS일렉트릭이 한국전력공사의 전력설비 예방진단 기술을 도입해 전력 인프라 고장 예측 능력을 강화한다. 빛가람 국제전력기술엑스포(BIXPO) 2026에서 한전과...'],
 ['LS일렉트릭, 한전 고장예측 기술 도입…반도체·데이터센터 공략 강화','한전과 전력설비 예방진단 기술이전 계약…고장 위험 5단계 분석 자체 설비 감시·자산관리 시스템과 연계…전력 솔루션 사업 확대 아주경제=조성준 기자 LS일렉트릭은 지난 4일 광주...'],
 ['LS일렉트릭, 370억 절감한 한전 기술 확보…반도체·데이터센터 정조준','LS일렉트릭이 한국전력공사(한전) 전력설비 고장예측 기술을 확보해 반도체 공장과 데이터센터 시장 공략에 나선다. 지난 4일 광주 김대중컨벤션센터에서 열린 빛가람 국제전력기술엑스포(BIXPO) 2026...'],
 ['한전, LS일렉트릭에 전력설비 예방진단솔루션 기술이전','한국전력이 4일 광주 김대중컨벤션센터에서 열린 빛가람 국제전력기술엑스포(BIXPO 2026)에서 LS일렉트릭과 전력설비 예방진단솔루션(SEDA) 기술이전 계약을 체결했다. 이번 계약은 한전이 자체 개발한 예방진단...'],
 ['LS일렉트릭, 한전 고장예측 기술 도입…전력설비 관리사업 강화','채대석 LS일렉트릭 대표(오른쪽), 김재군 한전 전력계통본부 부사장(왼쪽). LS일렉트릭 | 서울=한스경제 김창수 기자 | LS일렉트릭이 한국전력의 전력설비 예방진단 기술을 도입해 설비관리 솔루션을 고도화한다.'],
 ['LS일렉트릭, 한전 전력설비 고장예측 기술 도입…데이터센터 공략','LS일렉트릭이 한국전력공사의 전력설비 고장예측 기술을 도입해 반도체 공장과 데이터센터 등 안정적인 전력공급이 필요한 시장 공략에 나선다. 지난 4일 광주 김대중컨벤션센터에서 열린 빛가람...']
].map(([title,description],i)=>({ticker:'LS일렉트릭',title,description,pub_ms:Date.parse('2026-11-05T08:02:00+09:00')+i*60000,url:'https://example.com/'+i}));
test('seven observed licensor/licensee rewrites match in all 49 orders',()=>{
 for(const a of stories)for(const b of stories)assert.equal(sameNews(a,b),true,a.title+' / '+b.title);
});
test('general future technology transfers; distinct partner, technology and follow-up preserved',()=>{
 const a={ticker:'미래테크',pub_ms:Date.parse('2030-05-10'),title:'미래테크, 새봄연구원 배터리 진단 기술 도입',description:'새봄연구원과 배터리 진단 기술이전 계약을 체결했다.'};
 const b={...a,title:'새봄연구원, 미래테크에 배터리 진단 기술이전'};
 assert.equal(sameNews(a,b),true);
 for(const other of [
 {...b,title:'다른연구원, 미래테크에 배터리 진단 기술이전',description:'다른연구원과 배터리 진단 기술이전 계약'},
 {...b,title:'새봄연구원, 미래테크에 수소 합성 기술이전',description:'새봄연구원과 수소 합성 기술이전 계약'},
 {...b,title:'미래테크, 새봄연구원 배터리 진단 기술이전 계약 해지'},
 {...b,pub_ms:a.pub_ms+10*86400000,description:''}
 ])assert.equal(sameNews(a,other),false,other.title);
});

test('same venue is not evidence for distinct transferred technologies',()=>{
 const base={ticker:'미래테크',pub_ms:Date.parse('2030-05-10')};
 const a={...base,title:'미래테크, 새봄연구원 배터리 진단 기술 도입',description:'광주 컨벤션센터에서 열린 빛가람 국제전력기술엑스포(BIXPO)에서 새봄연구원과 배터리 진단 기술이전 계약'};
 const b={...base,title:'미래테크, 새봄연구원 수소 합성 기술 도입',description:'광주 컨벤션센터에서 열린 빛가람 국제전력기술엑스포(BIXPO)에서 새봄연구원과 수소 합성 기술이전 계약'};
 assert.equal(sameNews(a,b),false);
 assert.equal(sameNews({...a,title:a.title+' AB12'},{...a,title:a.title+' AB13'}),false);
});

test('late newspaper rewrites still match all seven earlier transfer stories',()=>{
 const late=[
 {title:'한전, LS일렉트릭에 AI 기반 전력설비 고장 예방 기술 이전',description:'매일일보 = 김현우 기자 | 한국전력이 자체 개발한 인공지능(AI) 기반 전력설비 고장 예방 기술을 LS일렉트릭에 이전한다. LS일렉트릭은 해당 기술을 자체 설비 상태 감시 시스템에 적용해 반도체 공장과 데이터센터...'},
 {title:'고장 88건 막은 한전 기술…LS일렉트릭, 설비관리 사업 접목',description:'매일일보 = 이강민 기자 | 한전이 구축한 변전소 고장 예방 기술을 LS일렉트릭이 자체 관리 체계에 끌어온다. 반도체 생산시설과 데이터센터에서 설비 위험을 먼저 파악하고 관리하는 사업을 키우려는 구상이다.'}
 ].map(x=>({...stories[0],...x,pub_ms:Date.parse('2026-11-05T17:22:00+09:00')}));
 for(const a of late)for(const b of [...stories,...late]){assert.equal(sameNews(a,b),true,a.title+' / '+b.title);assert.equal(sameNews(b,a),true);}
});
test('indirect adoption wording works for future companies without a dated block',()=>{
 const x={ticker:'미래기업',pub_ms:Date.parse('2031-03-02'),title:'미래기업, 새봄연구원 배터리 진단 기술 도입',description:'새봄연구원의 배터리 진단 기술을 미래기업이 자체 관리 체계에 끌어온다.'};
 const y={...x,title:'미래기업, 설비 관리 체계 강화',description:'새봄연구원의 배터리 고장 예방 기술을 미래기업의 설비에 접목한다.'};
 assert.equal(sameNews(x,y),true);assert.equal(sameNews(y,x),true);
 assert.equal(sameNews(x,{...y,title:'미래기업, 배터리 진단 기술이전 계약 해지'}),false);
});
