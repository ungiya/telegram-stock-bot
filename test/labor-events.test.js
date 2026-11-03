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
  for (const [item,stage] of [[actual,'started'],[settled,'settled'],[cancelled,'withdrawn'],[second,'announced']]) {
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


test('BusinessPost Nov 3 72-hour strike notice matches the prior warning across outlets',()=>{
  const published=Date.parse('2026-11-03T10:24:00+09:00');
  const latest={
    ticker:'효성중공업',
    title:'효성중공업 사무기술직 노조, 임협 진통에 4일부터 72시간 전면파업',
    description:'효성중공업 사무기술직 노동조합은 오는 4일부터 6일까지 72시간 전면파업에 돌입한다고 3일 밝혔다. 효성중공업 사무기술직 노조는 지난 6월5일 출범한 뒤 올해 회사와 첫 임금 및 단체협약(임단협) 교섭을 진행했다.',
    url:'https://www.businesspost.co.kr/BP?command=article_view&num=451009',
    pub_ms:published
  };
  assert.equal(laborStage(latest),'announced','future Nov 4 72-hour strike is a notice on Nov 3');
  assert.equal(laborRelation(report,latest),true);
  assert.equal(sameNews(report,latest),true);
  const marker='event:hyosung-wage-union-first-strike-warning-2026-11-03';
  assert.equal(coveredNewsEvent(latest),marker);
  assert.equal(coveredNewsEvent({...latest,pub_ms:undefined,description:''}),marker,'already delivered exact URL is never resent');
  assert.equal(coveredNewsEvent({...latest,url:'https://other-publisher.example/strike'}),marker);
  assert.equal(queuedNewsExcluded(latest),true);
  const incoming={
    originallink:latest.url,
    link:'https://n.news.naver.com/mnews/article/000/0001',
    title:latest.title,description:latest.description,
    pubDate:new Date(latest.pub_ms).toUTCString()
  };
  assert.equal(normalizeArticle(incoming,'효성중공업',published+3600000),null);
  // The actual strike can be reported as it happens the following day.
  const real={...latest,url:'https://independent.example/real',
    pub_ms:Date.parse('2026-11-04T09:00:00+09:00'),
    title:'효성중공업 사무기술직 노조, 4일 오전 실제 72시간 전면파업 돌입'};
  assert.equal(laborStage(real),'started');
  assert.equal(laborRelation(report,real),false);
  assert.equal(coveredNewsEvent(real),null);
  // Quoting the original strike schedule after the date has passed does not
  // wrongly reclassify a genuine later article as a future notice.
  assert.notEqual(laborStage({...real,title:latest.title}),'announced');
  assert.equal(coveredNewsEvent({...latest,url:'https://other-publisher.example/phase2',
    title:'효성중공업 노조, 임금 교섭 결렬에 2차 파업 예고'}),null);
});


test('reported Yonhap Nov 3 strike warning is suppressed, regardless of its excerpt or URL query', () => {
  const t=Date.parse('2026-11-03T12:38:00+09:00');
  const article={
    ticker:'효성중공업',
    title:'효성중공업 사무직노조, 내일부터 파업…사측 "공장 정상 가동"(종합)',
    description:'노조 "실적 개선에도 보상 미흡"…사측 "법과 원칙 따라 대응". 노조는 임금 단체협약 결렬을 이유로 파업을 예고했다.',
    url:'https://www.yna.co.kr/view/AKR20261103052951003?input=1195m',
    pub_ms:t
  };
  const event='event:hyosung-wage-union-first-strike-warning-2026-11-03';
  assert.equal(laborStage(article),'announced');
  assert.equal(coveredNewsEvent(article),event);
  assert.equal(queuedNewsExcluded(article),true);
  assert.equal(coveredNewsEvent({...article,title:'내용이 바뀌어도 URL이 확인된 기사',description:'',pub_ms:undefined}),event);
  assert.equal(normalizeArticle({
    title:article.title,
    description:article.description,
    originallink:article.url,
    link:'https://n.news.naver.com/mnews/article/001/0010000000',
    pubDate:new Date(t).toUTCString()
  },'효성중공업',t+3600000),null);
  const nextPhase={...article,url:'https://example.com/nov4-walkout',
    title:'효성중공업 사무직 노조, 4일 실제 파업 돌입',
    pub_ms:Date.parse('2026-11-04T12:00:00+09:00')};
  assert.equal(coveredNewsEvent(nextPhase),null);
});


test('BreakNews first-strike headline without "예고" is the Nov 3 notice, not a new walkout', () => {
  const pub_ms=Date.parse('2026-11-03T12:58:00+09:00');
  const article={
    ticker:'효성중공업',
    title:'효성중공업 사무직 노조, 출범 첫 파업..사측 "깊은 유감"',
    description:'효성중공업 사무직노동조합이 출범 이후 처음으로 파업에 들어간다. 노조는 사상 최대 실적에 걸맞은 보상과 노조 활동 보장을 요구했다.',
    url:'http://www.breaknews.com/1247882',
    pub_ms
  };
  const notice='event:hyosung-wage-union-first-strike-warning-2026-11-03';
  assert.equal(laborStage(article),'announced');
  assert.equal(coveredNewsEvent(article),notice);
  assert.equal(queuedNewsExcluded(article),true);
  assert.equal(coveredNewsEvent({...article,url:'https://another.example/reworded'}),notice);
  assert.equal(coveredNewsEvent({...article,description:'',url:'https://another.example/no-excerpt'}),notice);
  assert.equal(coveredNewsEvent({...article,title:'무관한 제목',description:'',pub_ms:undefined}),notice,
    'the user-reported original article URL is permanently recognized');
  const incoming={
    title:article.title,
    description:article.description,
    originallink:article.url,
    link:'https://n.news.naver.com/mnews/article/999/1247882',
    pubDate:new Date(pub_ms).toUTCString()
  };
  assert.equal(normalizeArticle(incoming,'효성중공업',pub_ms+60*60*1000),null);
  const actual={...article,url:'https://another.example/nov4-start',
    pub_ms:Date.parse('2026-11-04T09:00:00+09:00'),
    title:'효성중공업 사무직 노조, 실제 첫 파업 돌입'};
  assert.equal(laborStage(actual),'started');
  assert.equal(coveredNewsEvent(actual),null);
  assert.equal(sameNews(article,actual),false);
});
