import test from 'node:test';
import assert from 'node:assert/strict';
import { sameNews } from '../src/news-dedup.js';
import { assetTransferRelation } from '../src/asset-transfer-events.js';

const news=(title,description='')=>({ticker:'디앤디파마텍',title,description});

test('2026-11-02 Neuraly rights transfer is one event despite different news headlines',()=>{
 const a=news('디앤디파마텍, 美 자회사 신약 3종 권리 44억원에 인수',
    '디앤디파마텍이 미국 자회사 뉴랄리가 보유한 신약 파이프라인 3종을 인수했다.');
 const b=news('디앤디파마텍, 美 자회사 뉴랄리 보유 신약 3종 44억원 규모 양도·양수 계약',
    '자회사로부터 파이프라인과 개발 권리를 이전하는 계약이다.');
 assert.equal(assetTransferRelation(a,b),true);
 assert.equal(sameNews(a,b),true);
 assert.equal(sameNews(b,a),true);
});

test('rounded and exact transfer amounts identify the same event',()=>{
 const a=news('디앤디파마텍 자회사 신약 3종 권리 44억원 인수');
 const b=news('디앤디파마텍 뉴랄리 신약 3종 44억 2808만원 양수');
 assert.equal(sameNews(a,b),true);
});

test('different deal amounts, asset count, or parties are not suppressed',()=>{
 const base=news('디앤디파마텍 자회사 신약 3종 권리 44억 인수');
 assert.equal(sameNews(base,news('디앤디파마텍 자회사 신약 2종 권리 44억 인수')),false);
 assert.equal(sameNews(base,news('디앤디파마텍 자회사 신약 3종 권리 77억 인수')),false);
 assert.equal(sameNews(base,{...base,ticker:'다른 기업'}),false);
});

test('corrections and follow-ups do not get forced into original transfer event',()=>{
 const a=news('디앤디파마텍 자회사 신약 3종 44억에 인수');
 const b=news('디앤디파마텍 자회사 신약 3종 44억 이전 계약 정정');
 assert.equal(assetTransferRelation(a,b),null);
 assert.equal(sameNews(a,b),false);
});
