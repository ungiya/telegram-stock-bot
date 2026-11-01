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
test("Telegram message escapes html", () => {
  const result = formatTelegramMessage([{ ticker: "A&B", title: "<news>", url: "https://example.com/a?x=1&y=2" }]);
  assert.match(result, /A&amp;B/);
  assert.match(result, /&lt;news&gt;/);
  assert.match(result, /x=1&amp;y=2/);
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

