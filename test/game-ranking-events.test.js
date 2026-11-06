import test from 'node:test';
import assert from 'node:assert/strict';
import { reportedPubgSteamRank, pubgSteamRankRelation } from '../src/game-ranking-events.js';
import { sameNews, coveredNewsEvent } from '../src/news-dedup.js';
import { normalizeArticle, queuedNewsExcluded } from '../src/worker.js';

const now=Date.parse('2026-11-06T16:47:00+09:00');
const item=(title,description,url,offset=0)=>({ticker:'크래프톤',title,description,url,pub_ms:now+offset*60000});
const entries=[
 item("[크래프톤] 크래프톤 '배틀그라운드', 스팀 글로벌·한국 매출 순위 1위",
   "스팀 글로벌 차트 크래프톤의 'PUBG: 배틀그라운드'가 글로벌 게임 플랫폼 스팀의 매출 기반 인기 게임 순위에서 세계와 한국 시장 모두 1위를 기록했다. 크래프톤(대표 김창한)은 6일 기준...",
   "http://www.worktoday.co.kr/news/articleView.html?idxno=91596"),
 item("[크래프톤] 크래프톤 배틀그라운드 스팀 매출 1위 탈환",
   "크래프톤(대표 김창한)은 PUBG: 배틀그라운드(PUBG: BATTLEGROUNDS)가 6일 기준 스팀 최고 인기 게임 글로벌 차트에서 1위에 오르고 한국 지역에서도 1위를 기록했다고 밝혔다.",
   "https://www.econovill.com/news/articleView.html?idxno=756341",3),
 item('[크래프톤] “9년 지나도 배그는 배그”…크래프톤, 스팀 글로벌 매출 1위',
   "크래프톤의 대표 게임 'PUBG: 배틀그라운드(이하 배틀그라운드)'가 스팀 글로벌 매출 순위 1위에 올랐다. 크래프톤은 6일 배틀그라운드가 스팀 '최고 인기 게임' 차트에서 전 세계와 한국 지역 모두 1위를 차지했다고...",
   "https://www.dizzotv.com/site/data/html_dir/2026/11/06/2026110680181.html",10)
];
const key='event:krafton-pubg-steam-sales-1st-2026-11-06';

test('all three user screenshots refer to one PUBG Steam top-sales announcement',()=>{
 for(const [n,a] of entries.entries()){
  assert.equal(reportedPubgSteamRank(a),true,a.title);
  assert.equal(coveredNewsEvent(a),key,a.title);
  assert.equal(queuedNewsExcluded(a),true,a.title);
  for(const b of entries.slice(0,n)){
   assert.equal(pubgSteamRankRelation(a,b),true);
   assert.equal(sameNews(a,b),true,a.title);
   assert.equal(sameNews(b,a),true,b.title);
  }
 }
});

test('new outlet/title variants blocked at ingestion and from old queue',()=>{
 const latest=item('크래프톤 배그, 글로벌 스팀 매출 차트 정상 탈환',
   'PUBG 배틀그라운드가 스팀 최고 인기 게임 1위에 오르며 한국에서도 매출 1위를 기록했다.',
   'https://new-press.example/steam-top1',15);
 assert.equal(coveredNewsEvent(latest),key);
 assert.equal(sameNews(entries[0],latest),true);
 for(const a of [...entries,latest]){
  assert.equal(normalizeArticle({
   title:a.title,description:a.description,originallink:a.url,
   link:'https://n.news.naver.com/mnews/article/123/456789',
   pubDate:new Date(a.pub_ms).toUTCString()
  },'크래프톤',now+3600000),null,a.title);
  assert.equal(queuedNewsExcluded(a),true);
 }
});

test('same event at exact original URL stays blocked even if Naver excerpt missing',()=>{
 for(const a of entries){
  assert.equal(reportedPubgSteamRank({...a,title:'재편집된 제목',description:'',pub_ms:undefined}),true);
 }
});

test('different games, achievements and material updates are not merged',()=>{
 const others=[
  item('크래프톤 배틀그라운드 스팀 동시접속자 수 1위 기록',
    'PUBG 배틀그라운드가 스팀 동시 접속자 수를 기준으로 1위를 기록했다.','https://other.example/playercount'),
  item('크래프톤 배틀그라운드 스팀 매출 2위 기록',
    'PUBG 매출 순위 2위를 기록했다.','https://other.example/no2'),
  item('크래프톤, 배그 스팀 신규 시즌 업데이트…판매 순위 1위',
    'PUBG 배틀그라운드 스팀 매출 순위 1위 기록 이후 새 시즌 패치를 공개했다.','https://other.example/patch'),
  item('크래프톤 스팀 신규 공급 계약 체결…배그 매출 1위 배경',
    'PUBG 배틀그라운드가 6일 매출 1위 기록을 세웠다.','https://other.example/contract'),
  item('크래프톤, 인조이 스팀 매출 순위 1위',
    '크래프톤의 신작 inZOI가 스팀 매출 기준 1위 기록.','https://other.example/inzoi'),
  item('크래프톤 PUBG 배틀그라운드 스팀 매출 순위 1위, 7일 기준',
    '11월 7일 기준 순위 업데이트를 발표했다.','https://other.example/nov7'),
  item('크래프톤 배틀그라운드 스팀 매출 순위 1위',
    '2026년 11월 20일 다시 순위 1위를 탈환했다고 발표했다.','https://other.example/nov20')
 ];
 others.at(-1).pub_ms=Date.parse('2026-11-20T13:00:00+09:00');
 for(const a of others){
  assert.equal(reportedPubgSteamRank(a),false,a.title);
  assert.equal(coveredNewsEvent(a),null,a.title);
  assert.equal(sameNews(entries[0],a),false,a.title);
 }
 assert.equal(coveredNewsEvent({...entries[0],ticker:'넷마블',url:'https://unrelated.example/1'}),null);
});
