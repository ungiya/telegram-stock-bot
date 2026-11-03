import test from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, normalizeArticle, canonicalUrl, escapeTelegramHtml, formatTelegramMessage, blockedNewsSource } from "../src/worker.js";

test("decode news headlines and strip html", () => {
  assert.equal(cleanTitle("<b>에이피알</b> &amp; 주식"), "에이피알 & 주식");
});
test("canonical URL removes tracking parameters", () => {
  assert.equal(canonicalUrl("https://example.com/a?utm_source=foo&id=1#top"), "https://example.com/a?id=1");
});
test("reject unsupported URLs and invalid publication date", () => {
  assert.equal(canonicalUrl("javascript:alert(1)"), null);
  assert.equal(normalizeArticle({ title: "X", originallink: "https://a.com", pubDate: "invalid" }, "A", Date.now()), null);
});
test("news message contains plain title, summary and full URL without a numbered link label", () => {
  const result = formatTelegramMessage({ ticker: "A&B", title: "<news>", description: "요약 & 내용", url: "https://example.com/a?x=1&y=2" });
  assert.equal(result, "[A&B] <news>\n요약 & 내용\nhttps://example.com/a?x=1&y=2");
  assert.equal(formatTelegramMessage({ ticker: "A", title: "제목", url: "https://example.com" }), "[A] 제목\nhttps://example.com");
});
test("escape Telegram HTML", () => {
  assert.equal(escapeTelegramHtml('<a&">'), "&lt;a&amp;&quot;&gt;");
});

test("exclude Vegan News originals even when the visible link is a Naver syndication URL", () => {
  const now = Date.now();
  const article = { title: '크래프톤 신작 공개', pubDate: new Date(now).toUTCString(),
    originallink: 'https://www.vegannews.co.kr/news/article.html?no=398909', link: 'https://n.news.naver.com/article/1' };
  assert.equal(normalizeArticle(article, '크래프톤', now), null);
  assert.equal(normalizeArticle({ ...article, originallink: '', link: 'https://vegannews.co.kr/r' }, '크래프톤', now), null);
  assert.equal(blockedNewsSource('https://WWW.VEGANNEWS.CO.KR./r'), true);
  assert.equal(blockedNewsSource('https://vegannews.co.kr.example.com/r'), false);
  assert.equal(blockedNewsSource('https://example.com/vegannews.co.kr'), false);
  assert.ok(normalizeArticle({ ...article, originallink: 'https://example.com/news' }, '크래프톤', now));
});


test("exclude Insight originals and subdomains without blocking other publishers", () => {
  const now = Date.now();
  const article = { title: '크래프톤 신작 공개', pubDate: new Date(now).toUTCString(),
    originallink: 'https://www.insight.co.kr/news/1', link: 'https://n.news.naver.com/article/1' };
  assert.equal(normalizeArticle(article, '크래프톤', now), null);
  assert.equal(normalizeArticle({ ...article, originallink: '', link: 'https://web.insight.co.kr/news/1' }, '크래프톤', now), null);
  assert.equal(blockedNewsSource('https://INSIGHT.CO.KR./news/1'), true);
  assert.equal(blockedNewsSource('https://insight.co.kr.example.com/news/1'), false);
  assert.equal(blockedNewsSource('https://www.insightkorea.co.kr/news/1'), false);
});

test("exclude Pinpoint News originals, syndication and subdomains", () => {
  const now = Date.now();
  const article = { title: '크래프톤 신작 공개', pubDate: new Date(now).toUTCString(),
    originallink: 'https://www.pinpointnews.co.kr/news/articleView.html?idxno=1', link: 'https://n.news.naver.com/article/1' };
  assert.equal(normalizeArticle(article, '크래프톤', now), null);
  assert.equal(normalizeArticle({ ...article, originallink: '', link: 'https://m.pinpointnews.co.kr/news/1' }, '크래프톤', now), null);
  assert.equal(blockedNewsSource('https://PINPOINTNEWS.CO.KR./news/1'), true);
  assert.equal(blockedNewsSource('https://pinpointnews.co.kr.example.com/news/1'), false);
  assert.equal(blockedNewsSource('https://example.com/pinpointnews.co.kr'), false);
});

test("exclude Metro news originals, mobile and legacy domains", () => {
  const now = Date.now();
  const article = { title: '크래프톤 신작 공개', pubDate: new Date(now).toUTCString(),
    originallink: 'https://www.metroseoul.co.kr/article/1', link: 'https://n.news.naver.com/article/1' };
  assert.equal(normalizeArticle(article, '크래프톤', now), null);
  for (const host of ['metroseoul.co.kr', 'm.metroseoul.co.kr', 'emetro.co.kr', 'oauth.emetro.co.kr']) {
    assert.equal(normalizeArticle({ ...article, originallink: '', link: 'https://' + host + '/article/1' }, '크래프톤', now), null);
  }
  assert.equal(blockedNewsSource('https://METROSEOUL.CO.KR./article/1'), true);
  assert.equal(blockedNewsSource('https://metroseoul.co.kr.example.com/article/1'), false);
  assert.equal(blockedNewsSource('https://example.com/emetro.co.kr'), false);
});

test("exclude Fourth Journal originals and subdomains while retaining unrelated domains", () => {
  const now = Date.now();
  const article = { title: '크래프톤 신작 공개', pubDate: new Date(now).toUTCString(),
    originallink: 'https://www.4th.kr/news/articleView.html?idxno=1', link: 'https://n.news.naver.com/article/1' };
  assert.equal(normalizeArticle(article, '크래프톤', now), null);
  assert.equal(normalizeArticle({ ...article, originallink: '', link: 'https://m.4th.kr/news/1' }, '크래프톤', now), null);
  assert.equal(blockedNewsSource('https://4TH.KR./news/1'), true);
  assert.equal(blockedNewsSource('https://4th.kr.example.com/news/1'), false);
  assert.equal(blockedNewsSource('https://example.com/4th.kr'), false);
});

test("Naver errors distinguish gateway throttling and daily quota without exposing response details", async () => {
  const { naverError } = await import("../src/worker.js");
  for (const [data, expected] of [
    [{error:{errorCode:"410",message:"secret"}}, /code 410 \(throttle limited\)/],
    [{errorCode:"429",errorMessage:"secret"}, /code 429 \(daily quota exceeded\)/],
    [{error:{errorCode:"420"}}, /code 420 \(rate limited\)/],
    [{errorCode:"https://private.example/secret"}, /code unknown/]
  ]) {
    const error = await naverError(Response.json(data, {status:429}));
    assert.match(error.message, expected);
    assert.doesNotMatch(error.message, /secret|private/);
  }
  assert.match((await naverError(new Response("not json", {status:503}))).message, /status 503 · code unknown/);
});

test("queued Musinsa fashion and designer reports are discarded after filter changes", async () => {
  const { queuedNewsExcluded } = await import("../src/worker.js");
  const queued = [
    { ticker: "무신사", title: "무신사 김지용 크리에이티브 디렉터 영입", description: "상장과 IPO 준비", url: "https://example.com/1" },
    { ticker: "무신사", title: "무신사 패션 브랜드 매출 1조 돌파", description: "해외 진출", url: "https://example.com/2" },
    { ticker: "무신사", title: "무신사 브랜드 콜라보 컬렉션 발표", description: "실적 기대", url: "https://example.com/3" }
  ];
  for (const item of queued) assert.equal(queuedNewsExcluded(item), true, item.title);
  assert.equal(queuedNewsExcluded({ ticker: "무신사", title: "무신사 IPO 예비심사 청구", description: "", url: "https://example.com/4" }), false);
});


test("real PGS screenshot headlines are rejected at ingestion and in the existing send queue", () => {
  const now = Date.parse("2026-11-02T13:42:00+09:00");
  const cases = [
    ["파마리서치, 글로벌 심포지엄 개최…리쥬란 PN 임상 근거·안전성 및 시술 사례 공유",
     "강릉에서 개최된 제7회 파마리서치 글로벌 심포지엄(PGS). 64개국 의료진 750여 명 참석"],
    ["파마리서치, 글로벌 심포지엄 개최…64개국 의료진 750여명 참석",
     "파마리서치가 강릉에서 제7회 파마리서치 글로벌 심포지엄(PGS)을 성황리에 개최"],
    ["파마리서치, 제7회 '파마리서치 글로벌 심포지엄' 개최",
     "PharmaResearch Global Symposium, PGS 2026"]
  ];
  for (const [title, description] of cases) {
    const article = { title, description, originallink:"https://example.com/pgs-2026",
      pubDate:"Mon, 02 Nov 2026 04:41:00 GMT" };
    assert.equal(normalizeArticle(article,"파마리서치",now),null,title);
  }
});

test("PGS is dropped from pending queue; later actual trial results are not suppressed", async () => {
  const { queuedNewsExcluded } = await import("../src/worker.js");
  const pub_ms=Date.parse("2026-11-02T13:41:00+09:00");
  const base={ticker:"파마리서치",url:"https://example.com/news",pub_ms};
  assert.equal(queuedNewsExcluded({...base,title:
    "파마리서치, 글로벌 심포지엄 개최…64개국 의료진 750여명 참석",
    description:"64개국 750여명의 의료진이 참여한 제7회 PGS 개최"}),true);
  assert.equal(queuedNewsExcluded({...base,title:
    "파마리서치, 제7회 글로벌 심포지엄 개최…리쥬란 PN 임상 근거와 안전성 공유",
    description:"재생의학 분야 연구 발표"}),true);
  assert.equal(queuedNewsExcluded({...base,title:
    "파마리서치 PGS에서 임상 3상 결과 발표",
    description:"새로운 3상 결과를 공개했다."}),false);
});


test("New publisher blacklist blocks both incoming and queued news", async () => {
  const now = Date.now();
  const { queuedNewsExcluded } = await import("../src/worker.js");
  const domains = [
    ["뉴스퀘스트","newsquest.co.kr"],
    ["메가경제","megaeconomy.co.kr"],
    ["헬로티 헬로스톡","hellot.net"],
    ["TTL뉴스","ttlnews.com"],
    ["이코노미톡뉴스","economytalk.kr"]
  ];
  for (const [name, domain] of domains) {
    const article = {
      title: "에이피알 미국 신제품 출시",
      description: "에이피알 해외 신제품 출시",
      pubDate: new Date(now).toUTCString(),
      originallink: "https://www."+domain+"/news/articleView.html?idxno=1200",
      link: "https://n.news.naver.com/mnews/article/005/00000",
    };
    assert.equal(normalizeArticle(article,"에이피알",now),null,name+" origin");
    assert.equal(normalizeArticle({...article,originallink:"",link:"https://m."+domain+"/news/123"},"에이피알",now),null,name+" Naver fallback");
    assert.equal(blockedNewsSource("https://WWW."+domain.toUpperCase()+"./news"),true,name+" caps and dot");
    assert.equal(blockedNewsSource("https://cdn."+domain+"/news"),true,name+" subdomain");
    assert.equal(queuedNewsExcluded({ticker:"에이피알",title:article.title,description:article.description,url:article.originallink,pub_ms:now}),true,name+" queued");
    assert.equal(blockedNewsSource("https://"+domain+".example.org/news"),false,name+" spoof");
    assert.equal(blockedNewsSource("https://example.org/path/"+domain),false,name+" path");
  }
  assert.equal(blockedNewsSource("https://www.hellot.ne/news"),false,"mistyped HelloT URL does not refer to an actual site");
  assert.ok(normalizeArticle({
    title:"에이피알 미국 신제품 출시",pubDate:new Date(now).toUTCString(),
    originallink:"https://safe-example.org/news/123",
  },"에이피알",now));
});


test('Kiff launch is excluded both when collected from Naver and when waiting in queue', async () => {
  const { queuedNewsExcluded } = await import('../src/worker.js');
  const now=Date.parse('2026-11-02T22:30:00+09:00');
  const base={
    title:"크래프톤, AI 캐릭터 챗 'Kiff' 서비스 개시…K팝 인공지능 사업 확장",
    description:'크래프톤이 아티스트 페르소나 기반의 AI 캐릭터 챗 솔루션을 국내에 공식 상용화',
    originallink:'https://www.thedailypost.kr/news/articleView.html?idxno=116597',
    link:'https://n.news.naver.com/mnews/article/123/456',
    pubDate:new Date(now).toUTCString()
  };
  assert.equal(normalizeArticle(base,'크래프톤',now),null);
  assert.equal(queuedNewsExcluded({
    url:base.originallink,ticker:'크래프톤',
    title:base.title,description:base.description,pub_ms:now
  }),true);
  assert.ok(normalizeArticle({
    ...base,originallink:'https://example.com/follow-up',
    title:'크래프톤 Kiff 글로벌 신규 국가 출시 계약 체결',
  },'크래프톤',now),'material follow-up must remain eligible');
});


test('queued APR marketing articles are suppressed even if saved before the new filter', async () => {
  const {queuedNewsExcluded}=await import('../src/worker.js');
  const item={ticker:'에이피알',title:'에이피알 메디큐브 뷰티 인기 1위 캠페인 성료',description:'미국 매출 확대 기대',url:'https://example.com/apr-pr',pub_ms:Date.now()};
  assert.equal(queuedNewsExcluded(item),true);
  assert.equal(queuedNewsExcluded({...item,title:'에이피알 3분기 매출 7731억원 기록'}),false);
});


test('public health response exposes deployed news filter version without secrets',async()=>{
  const {default:worker}=await import('../src/worker.js');
  const {NEWS_POLICY_VERSION}=await import('../src/news-policy-version.js');
  const response=await worker.fetch(new Request('https://telegram-stock-news-alert.example.workers.dev/health'));
  assert.equal(response.status,200);
  const json=await response.json();
  assert.equal(json.ok,true);
  assert.equal(json.news_filter_version,NEWS_POLICY_VERSION);
  assert.equal(json.purpose,'stock-news-alert');
  assert.equal(await (await worker.fetch(new Request('https://telegram-stock-news-alert.example.workers.dev/secret'))).text(),'Not found');
});
