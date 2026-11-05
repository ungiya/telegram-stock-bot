import test from 'node:test';
import assert from 'node:assert/strict';
import {sameNews} from '../src/news-dedup.js';
const stamp=Date.parse('2026-11-05T09:00:00+09:00');
const a={ticker:'루닛',pub_ms:stamp,title:'루닛, 美 면역항암학회서 AI 공동연구 2건 발표',description:'의료 인공지능(AI) 기업 루닛(328130)이 글로벌 기업들과 공동연구를 통해 난소암의 종양 특성과 방광암의 면역항암제 치료반응을 분석한 연구성과를 공개한다. 루닛은 4일부터 8일(현지시간)까지 미국 애리조나주...',url:'https://www.news1.kr/bio/pharmaceutical-bio/6343656'};
const b={...a,title:'"AI 성과공개"…루닛, 글로벌기업과 美학회 참가',description:'의료 인공지능(AI) 기업 루닛이 미국에서 열리는 국제 면역항암학회에서 글로벌 기업들과 공동으로 진행한 연구 결과 2건을 공개한다. 루닛은 오는 8일까지 미국 애리조나주 피닉스에서 개최되는 2026...',url:'https://www.newsis.com/view/NISX20261105_0003855628'};
test('Lunit research announcement rewrites match in both delivery orders',()=>{
 assert.equal(sameNews(a,b),true);assert.equal(sameNews(b,a),true);
});
test('future companies and full society names or acronyms identify the same presentation package',()=>{
 const x={...a,ticker:'미래바이오',pub_ms:Date.parse('2030-11-05'),title:'미래바이오, SITC 2030 공동연구 2건 발표',description:'글로벌 기업들과 공동연구 성과를 공개한다.'};
 const y={...x,title:'미래바이오 AI 성과 공개…미국 학회 참가',description:'2030 국제면역항암학회에서 공동으로 진행한 연구 결과 2건을 발표한다.'};
 assert.equal(sameNews(x,y),true);assert.equal(sameNews(y,x),true);
 const generic={...x,title:'미래바이오, 미래의학학회서 공동연구 3건 공개',description:'2030년 미래의학학회에 참가해 공동 연구 성과를 발표한다.'};
 assert.equal(sameNews(generic,{...generic,title:'미래바이오, 연구성과 공개',description:'2030 미래의학학회에서 공동 연구 결과 3건을 발표한다.'}),true);
});
test('different meetings, years, package counts, new outcomes and later announcements stay separate',()=>{
 for(const other of [
 {...b,description:b.description.replace('면역항암학회','방사선종양학회')},
 {...b,description:b.description.replace('2026','2027')},
 {...b,description:b.description.replace('2건','3건')},
 {...b,title:'루닛, 면역항암학회서 임상 3상 결과 발표'},
 {...b,title:'루닛, 면역항암학회 공동연구서 유효성 입증'},
 {...b,title:'루닛, 면역항암학회 추가 연구 결과 발표'},
 {...b,pub_ms:stamp+10*86400000},
 {...b,ticker:'다른회사'}
 ])assert.equal(sameNews(a,other),false,other.title+' / '+other.description);
});
