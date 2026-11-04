import test from 'node:test';
import assert from 'node:assert/strict';
import {sameNews} from '../src/news-dedup.js';
import {platformLaunchRelation} from '../src/platform-launch-events.js';
const ts=Date.parse('2026-11-04T10:30:00+09:00');
const a={ticker:'넷마블',title:'"글로벌 IP 무대 넓힌다"…넷마블 나 혼자만 레벨업:어라이즈 오버드라...',description:"넷마블이 글로벌 대표 흥행 IP의 플랫폼 확장을 가속화하며 콘솔 시장 공략에 속도를 낸다. 넷마블은 액션 게임 '나 혼자만 레벨업:어라이즈 오버드라이브'의 플레이스테이션5(PS5) 및 엑스박스 시리즈 X|S(Xbox Series X|S)...",pub_ms:ts};
const b={...a,title:"넷마블 '나 혼자만 레벨업: 어라이즈 오버드라이브', PS5·Xbox 버전 출시",description:"넷마블이 액션게임 '나 혼자만 레벨업: 어라이즈 오버드라이브'의 콘솔 버전을 출시하며 플랫폼 확장에 나섰다. PC 이용자를 중심으로 선보였던 게임을 플레이스테이션과 엑스박스까지 확대해 글로벌..."};
test('actual Netmarble strategy headline and platform release headline are one launch',()=>{
 assert.equal(platformLaunchRelation(a,b),true);assert.equal(sameNews(a,b),true);assert.equal(sameNews(b,a),true);
});
test('different companies and future product names also use normalized product identity and destinations',()=>{
 const x={...a,ticker:'새회사',pub_ms:Date.parse('2030-01-01'),title:'새회사 콘솔 사업 확장',description:"액션게임 '새로운 게임: 레전드 월드' PS5 및 Xbox 버전 정식 출시"};
 const y={...x,title:"새회사 '새로운게임 레전드월드' 플레이스테이션5·엑스박스 출시",description:''};
 assert.equal(sameNews(x,y),true);
 assert.equal(platformLaunchRelation(x,{...y,title:y.title.replace('레전드월드','신세계')}),null);
 assert.equal(platformLaunchRelation(x,{...y,title:y.title+' 매출 100억원'}),null);
 assert.equal(platformLaunchRelation(x,{...y,ticker:'다른회사'}),null);
});
test('different platforms, sequels and later developments remain separate',()=>{
 const pc={...b,title:"넷마블 '나 혼자만 레벨업:어라이즈 오버드라이브' PC 버전 출시",description:''};
 assert.equal(sameNews(pc,b),false);
 for(const title of [b.title+' 신규 기능 업데이트',b.title+' 판매량 100만 돌파'])assert.notEqual(platformLaunchRelation(a,{...b,title}),true);
 assert.equal(platformLaunchRelation(a,{...b,pub_ms:ts+20*86400000}),null);
});
