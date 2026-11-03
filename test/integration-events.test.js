import test from 'node:test';
import assert from 'node:assert/strict';
import { icoobSeersIntegration, integrationRelation } from '../src/integration-events.js';
import { coveredNewsEvent, sameNews } from '../src/news-dedup.js';
import { normalizeArticle, queuedNewsExcluded } from '../src/worker.js';

const first={
  ticker:'씨어스',
  title:"[씨어스] '의료데이터 한곳에 모은다'…아이쿱 'LabConnect' 중심 씨어스 연동 확대",
  description:"아이쿱은 의료데이터 통합 플랫폼 'LabConnect'를 중심으로 씨어스의 입원환자 모니터링 솔루션 'thynC'에 자사 연속혈당 모니터링 솔루션 'CGM LiVE'를 적용하고 있다.",
  url:'https://www.thefairnews.co.kr/news/articleView.html?idxno=92899',
  pub_ms:Date.parse('2026-11-03T13:25:00+09:00')
};
const second={
  ticker:'씨어스',
  title:'[씨어스] 아이쿱, 씨어스 입원환자 모니터링 솔루션에 연속혈당 솔루션 적용',
  description:"아이쿱은 의료데이터 통합 플랫폼 LabConnect를 중심으로 씨어스 솔루션 '씽크(thynC)'에 CGM LiVE를 연동했다.",
  url:'https://second-outlet.example/news',
  pub_ms:Date.parse('2026-11-03T13:26:00+09:00')
};
const key='event:seers-icoob-labconnect-thync-cgm-integration-2026-11-03';

test('user screenshot: different wording for one iKoob-LabConnect/Seers integration counts once',()=>{
  assert.equal(icoobSeersIntegration(first),true);
  assert.equal(icoobSeersIntegration(second),true);
  assert.equal(integrationRelation(first,second),true);
  assert.equal(sameNews(first,second),true);
  assert.equal(sameNews(second,first),true);
  assert.equal(coveredNewsEvent(first),key);
  assert.equal(coveredNewsEvent(second),key);
  assert.equal(queuedNewsExcluded(first),true);
  assert.equal(queuedNewsExcluded(second),true);
});

test('already-received TheFairNews article is blocked by exact URL even with an empty excerpt',()=>{
  assert.equal(coveredNewsEvent({...first,title:'새 제목으로 재배포',description:'',pub_ms:undefined}),key);
  const now=Date.parse('2026-11-03T14:00:00+09:00');
  for(const article of [first,second]){
    assert.equal(normalizeArticle({
      title:article.title,
      description:article.description,
      originallink:article.url,
      link:'https://news.naver.com/placeholder',
      pubDate:new Date(article.pub_ms).toUTCString()
    },'씨어스',now),null,article.title);
  }
});

test('new contracts, installations, earnings and different partners remain news',()=>{
  const separate=[
    {...second,title:'씨어스 아이쿱, 랩커넥트 CGM LiVE 신규 공급 계약 체결'},
    {...second,title:'씨어스 아이쿱, 랩커넥트 CGM LiVE 서울A병원 첫 도입 확정'},
    {...second,title:'씨어스 아이쿱 랩커넥트 CGM LiVE 매출 500억원 달성'},
    {...second,title:'씨어스, 다른 협력사와 연속혈당 모니터링 솔루션 연동',description:'다른 파트너와 계약'},
    {...second,title:'씨어스, 아이쿱 thynC 2.0 새로운 버전 출시'},
    {...second,pub_ms:Date.parse('2027-01-03T13:26:00+09:00')}
  ];
  for(const item of separate) {
    assert.equal(icoobSeersIntegration(item),false,item.title);
    assert.equal(coveredNewsEvent(item),null,item.title);
    assert.equal(sameNews(first,item),false,item.title);
  }
  assert.equal(coveredNewsEvent({...first,ticker:'다른회사',url:second.url}),null);
  assert.equal(coveredNewsEvent({...first,pub_ms:Date.parse('2026-05-27T12:00:00+09:00'),url:second.url}),null,
    'earlier May MOU is a distinct partnership milestone');
});

test('same-company generic digital-health articles without iKoob are not merged',()=>{
  const unrelated={...second,description:'씨어스 자체 솔루션 고도화',title:'씨어스 입원환자 모니터링 신제품 공개'};
  assert.equal(icoobSeersIntegration(unrelated),false);
  assert.equal(integrationRelation(first,unrelated),null);
  assert.equal(sameNews(first,unrelated),false);
});
