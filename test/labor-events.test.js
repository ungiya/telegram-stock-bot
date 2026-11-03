import test from 'node:test';
import assert from 'node:assert/strict';
import { laborStage, laborRelation, reportedHyosungStrikeNotice } from '../src/labor-events.js';
import { sameNews, coveredNewsEvent } from '../src/news-dedup.js';
import { normalizeArticle, queuedNewsExcluded } from '../src/worker.js';

const when=Date.parse('2026-11-03T09:00:00+09:00');
const report={
  ticker:'효성중공업',
  title:'효성중공업 노조 “임금 인상, 물가에도 못 미쳐”…첫 파업 예고',
  description:'효성중공업 사무기술직 노동조합이 출범 이후 처음으로 전면파업에 돌입한다고 3일 밝혔다. 향후 추가 단체행동까지 예고되면서 임금과 성과급 등 보상 문제를 둘러싼 노사 갈등이 본격화할 조짐을 보이고 있다.',
  url:'https://www.mdtoday.co.kr/news/articleView.html?idxno=622617',
  pub_ms:when
};
const syndication={
  ticker:'효성중공업',
  title:'효성중공업 사무기술직 노조, 임금·성과급 갈등에 첫 파업 예고',
  description:'노동조합은 보상 문제가 해결되지 않으면 파업에 들어갈 예정이라고 밝혔다.',
  url:'https://another.example/hyosung-union',
  pub_ms:when+2*3600000
};

test('known Hyosung first strike warning and reported URL are already handled',()=>{
  assert.equal(laborStage(report),'announced');
  assert.equal(laborStage(syndication),'announced');
  assert.equal(coveredNewsEvent(report),'event:hyosung-wage-union-first-strike-warning-2026-11-03');
  assert.equal(coveredNewsEvent({...report,description:'',pub_ms:undefined}),'event:hyosung-wage-union-first-strike-warning-2026-11-03');
  assert.equal(coveredNewsEvent(syndication),'event:hyosung-wage-union-first-strike-warning-2026-11-03');
  assert.equal(queuedNewsExcluded(report),true);
  assert.equal(queuedNewsExcluded(syndication),true);
  const incoming={
    title:report.title,description:report.description,
    originallink:report.url,link:'https://n.news.naver.com/mnews/article/123/456',
    pubDate:new Date(when).toUTCString()
  };
  assert.equal(normalizeArticle(incoming,'효성중공업',when+3600000),null);
  assert.equal(reportedHyosungStrikeNotice({...report,ticker:'크래프톤'}),false);
});

test('cross-outlet wage strike warning matches independently of wording',()=>{
  assert.equal(laborRelation(report,syndication),true);
  assert.equal(sameNews(report,syndication),true);
  assert.equal(sameNews(syndication,report),true);
  assert.equal(laborRelation({...report,ticker:'크래프톤'},syndication),null);
  assert.equal(laborRelation(report,{...syndication,pub_ms:when+9*86400000}),null);
});

test('actual walkouts, settlements, withdrawals, and later strike notices stay alertable',()=>{
  const actual={...syndication,url:'https://other.example/strike',
    title:'효성중공업 사무기술직 노조, 임금 협상 난항에 첫 파업 돌입',
    description:'임금 인상률을 둘러싼 노조와 사측의 협상 결렬 이후 파업이 시작됐다.'};
  const settled={...syndication,url:'https://other.example/settled',
    title:'효성중공업 노사, 임금협상 타결…파업 예고 철회'};
  const cancelled={...syndication,url:'https://other.example/withdrawn',
    title:'효성중공업 노조, 임금 인상 협상 재개로 파업 철회'};
  const second={...syndication,url:'https://other.example/second',
    title:'효성중공업 노조, 임금협상 결렬에 2차 파업 예고'};
  for (const [item,stage] of [[actual,'started'],[settled,'withdrawn'],[cancelled,'withdrawn'],[second,'announced']]) {
    assert.equal(laborStage(item),stage,item.title);
    assert.equal(coveredNewsEvent(item),null,item.title);
    assert.equal(sameNews(report,item),false,item.title);
  }
  assert.equal(laborRelation(actual,{...actual,url:'https://independent.example/actual',
    title:'효성중공업 임금교섭 결렬에 노조 실제 파업 시작'}),true);
});

test('unrelated union stories and delayed re-reporting are not swept into prior strike warning',()=>{
  assert.equal(coveredNewsEvent({...syndication,pub_ms:Date.parse('2026-12-01T00:00:00Z')}),null);
  assert.equal(coveredNewsEvent({...syndication,ticker:'서진시스템'}),null);
  assert.equal(laborRelation(report,{...syndication,title:'효성중공업 분기 영업이익 상승'}),null);
  assert.equal(coveredNewsEvent({...syndication,title:'효성중공업 임금 협상 결렬',description:'노조와 사측의 협상이 결렬됐다'}),null);
});
