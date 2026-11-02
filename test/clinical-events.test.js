import test from 'node:test';
import assert from 'node:assert/strict';
import { sameNews } from '../src/news-dedup.js';

const dd = (title, description = '') => ({ticker: '디앤디파마텍', title, description});

test('DD01 readout syndicated with different headlines and endpoint percentages is one event', () => {
  const a=dd('디앤디파마텍, DD01 임상 2상 유효성 확인',
    'DD01 MASH 임상 2상에서 개선 효과가 나타났다. 체중 감소율은 18%였다.');
  const b=dd('디앤디파마텍 DD01 MASH 신약 2상 긍정적 결과 발표',
    '임상 2상에서 간 지방 감소율은 15%로 확인됐다.');
  assert.equal(sameNews(a,b),true);
  assert.equal(sameNews(b,a),true);
});

test('same candidate and indication in summary recognizes rewritten headlines', () => {
  const a=dd('디앤디파마텍 MASH 임상 2상 유효성 확인','DD01 임상시험 결과');
  const b=dd('디앤디파마텍 비알코올성 지방간염 임상 2상 긍정적 결과','DD01 효능 데이터');
  assert.equal(sameNews(a,b),true);
});

test('new stage, indication, candidate, and lifecycle events must still alert', () => {
  const first=dd('디앤디파마텍 DD01 임상 2상 결과 발표');
  for (const title of [
    '디앤디파마텍 DD01 임상 1상 결과 발표',
    '디앤디파마텍 DD01 비만 임상 2상 결과 발표',
    '디앤디파마텍 DD02 임상 2상 결과 발표',
    '디앤디파마텍 DD01 임상 2상 환자 등록 개시',
    '디앤디파마텍 DD01 임상 2상 중단',
    '디앤디파마텍 DD01 임상 2상 허가 신청'
  ]) {
    if (title.includes('비만')) {
      assert.equal(sameNews(dd('디앤디파마텍 DD01 MASH 임상 2상 결과 발표'),dd(title)),false);
    } else {
      assert.equal(sameNews(first,dd(title)),false);
    }
  }
  assert.equal(sameNews(dd('디앤디파마텍 DD01 임상 2상 중간 결과 발표'),
    dd('디앤디파마텍 DD01 임상 2상 최종 결과 발표')),false);
});

test('unrelated companies and financial revisions remain distinct', () => {
  assert.equal(sameNews(dd('DD01 임상 2상 결과 발표'),
    {ticker:'에이피알',title:'DD01 임상 2상 결과 발표',description:''}),false);
  assert.equal(sameNews(
    {ticker:'효성중공업',title:'효성중공업 공급 계약',description:'계약액 1.5조원'},
    {ticker:'효성중공업',title:'효성중공업 공급 계약',description:'계약액 1.8조원'}
  ),false);
});
