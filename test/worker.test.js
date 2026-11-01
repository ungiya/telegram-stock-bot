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
