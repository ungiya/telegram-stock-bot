import test from "node:test";
import assert from "node:assert/strict";
import { cleanTitle, normalizeArticle, canonicalUrl, escapeTelegramHtml, formatTelegramMessage } from "../src/worker.js";

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
