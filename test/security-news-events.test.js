import test from 'node:test';
import assert from 'node:assert/strict';
import {sameNews} from '../src/news-dedup.js';
const ts=Date.parse('2026-11-04T13:45:00+09:00');
const a={ticker:'시프트업',pub_ms:ts,title:"시프트업 '승리의 여신: 니케' PC 실행 프로그램 해킹 노출 정황",description:"국내 게임사 시프트업이 개발하고 중국 텐센트가 글로벌 배급을 맡은 인기 서브컬처 게임 '승리의 여신: 니케'의 공식 PC 실행 프로그램이 해킹에 노출됐다는 우려가..."};
const b={...a,title:"시프트업 '승리의 여신: 니케', 텐센트 배포망 뚫렸나…PC 런처 해킹 사고",description:"시프트업이 개발한 '승리의 여신: 니케'의 공식 PC 런처가 해킹 공격에 악용된 것으로 드러났다. 텐센트의 게임 브랜드 레벨인피니트가 운영하는 콘텐츠전송네트워크(CDN)에서 배포 파일이 변조된 정황이 확인됐다."};
const c={...a,title:'“공식 홈페이지 게임 실행 프로그램에 악성코드”…시프트업 ‘니케’ 해킹 의혹',description:"국내 게임사 시프트업이 개발하고 중국 텐센트가 배급하는 게임 '승리의 여신: 니케(이하 니케)'의 공식 PC 실행 프로그램에 악성코드가 포함됐다는 의혹이 제기됐다. 아직 공식 입장은 내놓지 않았다."};
test('all screenshot rewrites describe one product distribution security incident',()=>{
 for(const x of [a,b,c])for(const y of [a,b,c])assert.equal(sameNews(x,y),true,x.title+' / '+y.title);
});
test('future companies and products use same incident comparison',()=>{
 const x={...a,ticker:'미래회사',pub_ms:Date.parse('2030-04-04'),title:"미래회사 '스타게이트' PC 런처 해킹 정황"};
 const y={...x,title:"미래회사 '스타 게이트' 배포망 변조…악성코드 의혹"};
 assert.equal(sameNews(x,y),true);
 assert.equal(sameNews(x,{...y,ticker:'별도회사'}),false);
 assert.equal(sameNews(x,{...y,title:"미래회사 '다른게임' PC 해킹 사고",description:''}),false);
});
test('official confirmation, response, damage counts and new attacks remain independently alertable',()=>{
 for(const title of ["시프트업 '니케' PC 런처 해킹 공식 확인", "시프트업 '니케' PC 해킹 패치 배포", "시프트업 '니케' PC 해킹 피해 규모 발표", "시프트업 '니케' PC 런처 또다시 해킹"]){
  assert.equal(sameNews(a,{...c,title}),false,title);
 }
});
