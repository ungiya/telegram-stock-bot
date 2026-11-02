import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  publisherDomain,publisherName,rawPublisherObservation,
  recordPublisherObservations,publisherStatistics,formatPublisherStatistics
} from '../src/publishers.js';

function dbFixture(t) {
  const sql=new DatabaseSync(':memory:');
  for(const filename of ['0001_init.sql','0002_commands.sql','0003_reports.sql',
    '0004_news_descriptions.sql','0005_news_dedup.sql','0006_dart.sql',
    '0007_news_schedule.sql','0008_kind.sql','0009_news_delivery.sql',
    '0010_news_filter_count.sql','0011_news_publishers.sql']) {
    sql.exec(readFileSync(new URL('../migrations/'+filename,import.meta.url),'utf8'));
  }
  t.after(()=>sql.close());
  const DB={
    prepare(query) {
      let values=[];
      return { bind(...args){values=args;return this;},
        async first(){return sql.prepare(query).get(...values) || null;},
        async all(){return {results:sql.prepare(query).all(...values)};},
        async run(){return sql.prepare(query).run(...values);}
      };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {const r=[];for(const statement of statements)r.push(await statement.run());sql.exec('COMMIT');return r;}
      catch(error){sql.exec('ROLLBACK');throw error;}
    }
  };
  return {sql,env:{DB}};
}

test('publisher domains use original article hosts, not Naver wrappers',()=>{
  assert.equal(publisherDomain('https://WWW.NEWS1.KR./news?id=1'),'news1.kr');
  assert.equal(publisherDomain('https://m.mt.co.kr/a'),'mt.co.kr');
  assert.equal(publisherDomain('javascript:alert(1)'),null);
  assert.equal(publisherName('news1.kr'),'뉴스1');
  assert.equal(publisherName('someunknown.example'),'someunknown.example');
  assert.equal(publisherName('notnews1.kr'),'notnews1.kr');
});
test('raw publisher tracking ignores stale news and prefers publisher original URL',()=>{
  const now=Date.parse('2026-11-02T12:00:00Z');
  const article={originallink:'https://www.gamechosun.co.kr/news/id=55',
    link:'https://news.naver.com/news?id=55',pubDate:new Date(now).toUTCString()};
  const row=rawPublisherObservation(article,now,null,()=>'blocked_source',v=>v);
  assert.deepEqual(row,{url:article.originallink,domain:'gamechosun.co.kr',reason:'blocked_source'});
  assert.equal(rawPublisherObservation({...article,pubDate:new Date(now-2*86400000).toUTCString()},
    now,null,()=> 'eligible',v=>v),null);
  assert.equal(rawPublisherObservation({...article,pubDate:'invalid'},now,null,()=> 'eligible',v=>v),null);
});
test('one URL under many tickers and repeated polls counts once, then reports outcomes',async t=>{
  const {sql,env}=dbFixture(t),now=Date.now();
  const obs=[
    {url:'https://www.news1.kr/story/1',domain:'news1.kr',reason:'eligible'},
    {url:'https://www.news1.kr/story/1',domain:'news1.kr',reason:'content_filter'},
    {url:'https://www.news1.kr/story/2',domain:'news1.kr',reason:'known_event'},
    {url:'https://newsis.com/story/3',domain:'newsis.com',reason:'blocked_source'},
    {url:'https://m.mt.co.kr/story/4',domain:'mt.co.kr',reason:'content_filter'}
  ];
  assert.equal(await recordPublisherObservations(env,obs,now),4);
  assert.equal(await recordPublisherObservations(env,obs,now+10000),0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM news_publisher_seen').get().n,4);
  assert.equal(sql.prepare("SELECT reason FROM news_publisher_seen WHERE url=?")
    .get('https://www.news1.kr/story/1').reason,'eligible');
  sql.prepare("INSERT INTO news_delivery(url,ticker,title,description,pub_ms,state,attempt_ms,sent_ms) VALUES (?,?,?,'',?,'sent',?,?)")
    .run('https://www.news1.kr/story/1','에이피알','에이피알 새 계약',now,now,now);
  sql.prepare('INSERT INTO articles(url,ticker,title,pub_ms,discovered_ms,sent_ms,duplicate_of) VALUES (?,?,?,?,?,?,?)')
    .run('https://www.news1.kr/story/2','에이피알','에이피알 같은 계약',now,now,now,'event:known');
  let stats=await publisherStatistics(env,now+30000);
  assert.equal(stats.publishers,3);
  assert.equal(stats.articles,4);
  const news1=stats.rows.find(r=>r.domain==='news1.kr');
  assert.equal(news1.collected,2);
  assert.equal(news1.sent,1);
  assert.equal(news1.duplicates,1);
  assert.match(formatPublisherStatistics(stats),/뉴스1.*news1.kr/);
  assert.match(formatPublisherStatistics(stats),/매체차단/);
  const later=await publisherStatistics(env,now+8*86400000);
  assert.equal(later.articles,0);
});
test('publisher page two includes other publishers and does not count repeated URL',async t=>{
  const {env}=dbFixture(t),now=Date.now();
  const observations=Array.from({length:16},(_,i)=>({
    url:'https://publisher'+i+'.example/story/'+i,
    domain:'publisher'+i+'.example',reason:'content_filter'
  }));
  await recordPublisherObservations(env,observations,now);
  const first=await publisherStatistics(env,now,1),second=await publisherStatistics(env,now,2);
  assert.equal(first.pages,2);
  assert.equal(first.rows.length,15);
  assert.equal(second.rows.length,1);
  assert.match(formatPublisherStatistics(first),/다음 페이지: \/publishers 2/);
  assert.match(formatPublisherStatistics(second),/조회 2\/2페이지/);
});
