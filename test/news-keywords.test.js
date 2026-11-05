import test from 'node:test';
import assert from 'node:assert/strict';
import {sameNews} from '../src/news-dedup.js';
const a={ticker:'루닛',pub_ms:Date.parse('2026-11-05T12:27:00+09:00'),title:'루닛, 글로벌 진단기업과 AI 암 분석 성과…난소암·방광암 치료 예측 가능',description:'루닛 SITC 2026 참가. 루닛이 글로벌 진단·임상시험 기업들과 손잡고 인공지능(AI)을 활용한 암 치료반응 예측 기술의 활용 가능성을 입증했다. 난소암과 방광암 환자의...'};
const b={...a,title:'루닛, 글로벌 파트너와 난소·방광암 AI 분석 결과 공개',description:'루닛이 미국의 저명한 면역항암 학술대회에서 글로벌 진단 및 임상시험 파트너사들과 함께 인공지능(AI)을 활용한 암 조직 분석 연구 성과를 공개했다. 루닛은 5일 미국 애리조나주 피닉스에서 열리는 2026...'};
test('reported cancer research paraphrases are duplicates',()=>{assert.equal(sameNews(a,b),true);assert.equal(sameNews(b,a),true);});
test('specific keyword repetition generalizes and generic AI does not',()=>{
 const x={ticker:'미래기업',pub_ms:a.pub_ms,title:'미래기업, 리버스캔 공개',description:'리버스캔으로 항만시설 점검 자동화'};
 const y={...x,title:'미래기업 리버스캔으로 세계 진출',description:'항만시설에 리버스캔 적용 추진'};
 assert.equal(sameNews(x,y),true);
 assert.equal(sameNews({...x,title:'미래기업 글로벌 AI 연구',description:'인공지능 연구 성과 공개'},{...y,title:'미래기업 AI 사업 강화',description:'글로벌 기업과 인공지능 서비스 개발'}),false);
 assert.equal(sameNews(x,{...y,title:'미래기업 리버스캔 신규 계약 체결'}),false);
});
