import test from 'node:test';
import assert from 'node:assert/strict';
import {sameNews} from '../src/news-dedup.js';
const a={ticker:'크래프톤',pub_ms:Date.parse('2026-11-05T09:45:00+09:00'),title:"크래프톤 '배틀그라운드', '아이브' 컬래버레이션 콘텐츠 업데이트",description:"크래프톤은 '배틀그라운드'에 그룹 '아이브' 컬래버레이션을 적용했다. 크래프톤의 'PUBG: 배틀그라운드'가 그룹 아이브의 곡 콘셉트로 맵과 캐릭터, 이모트를 꾸민 컬래버레이션..."};
const b={...a,title:"아이브가 배틀그라운드 속으로…크래프톤, 'LOVE DIVE' 테마 공간 추가",description:"크래프톤이 'PUBG: 배틀그라운드' 44.1 업데이트에 그룹 아이브와의 협업 콘텐츠를 적용했다. 앞서 진행한 에스파 협업처럼 음악과 캐릭터 아이템에 게임 내 체험 공간을 결합했다."};
test('same game collaboration despite theme headline and previous partner background',()=>{assert.equal(sameNews(a,b),true);assert.equal(sameNews(b,a),true);});
test('generic future games and partners; distinct partners, games, versions and followups',()=>{
 const x={...a,ticker:'미래게임',pub_ms:Date.parse('2030-01-02'),title:"미래게임 '별빛세상', '새봄' 콜라보 콘텐츠 업데이트",description:"'별빛세상' 2.1 업데이트에 그룹 새봄과의 협업 콘텐츠 적용"};
 const y={...x,title:'새봄이 별빛세상 속으로…테마 공간 추가'};
 assert.equal(sameNews(x,y),true);
 for(const z of [
 {...y,title:y.title.replaceAll('새봄','여름'),description:y.description.replaceAll('새봄','여름')},
 {...y,title:y.title.replaceAll('별빛세상','다른게임'),description:y.description.replaceAll('별빛세상','다른게임')},
 {...y,description:y.description.replace('2.1','2.2')},
 {...y,title:'별빛세상 새봄 협업 취소'},
 {...y,title:'별빛세상 새봄 협업 매출 성과 발표'}
 ])assert.equal(sameNews(x,z),false,z.title);
});
