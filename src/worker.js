import { newsAllowed } from "./filters.js";
import { WATCHLIST, ALIASES } from "./watchlist.js";

const NAVER_NEWS_API = "https://naverapihub.apigw.ntruss.com/search/v1/news";
const TELEGRAM_API = "https://api.telegram.org";
const FRESHNESS_MS = 24 * 60 * 60 * 1000;
const MAX_PER_ALERT = 10;

export function cleanTitle(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_all, entity) => {
      const normalized = entity.toLowerCase();
      const known = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
      if (Object.hasOwn(known, normalized)) return known[normalized];
      const n = normalized.startsWith("#x")
        ? Number.parseInt(normalized.slice(2), 16)
        : Number.parseInt(normalized.slice(1), 10);
      return Number.isInteger(n) && n > 0 && n <= 0x10ffff
        ? String.fromCodePoint(n)
        : "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase().startsWith("utm_") || ["fbclid", "gclid"].includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeArticle(item, ticker, now) {
  const url = canonicalUrl(item.originallink || item.link);
  const title = cleanTitle(item.title);
  const publishedAt = Date.parse(item.pubDate);
  if (!url || !title || !Number.isFinite(publishedAt) || publishedAt > now + 300_000) {
    return null;
  }
  const description = cleanTitle(item.description);
  if (!newsAllowed(ticker, ALIASES[ticker] || [ticker], title, description)) return null;
  return { url, ticker, title, publishedAt };
}

export function escapeTelegramHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatTelegramMessage(rows) {
  const header = "🗞️ <b>관심 종목 신규 뉴스 " + rows.length + "건</b>";
  const lines = rows.map((item, index) => {
    const title = item.title.length > 160 ? item.title.slice(0, 157) + "..." : item.title;
    return (index + 1) + ". <b>[" + escapeTelegramHtml(item.ticker) + "]</b> "
      + escapeTelegramHtml(title) + "\n"
      + '<a href="' + escapeTelegramHtml(item.url) + '">기사 원문 보기</a>';
  });
  return [header, ...lines].join("\n\n");
}

async function searchNews(env, ticker) {
  const items = [];
  for (const query of ALIASES[ticker] || [ticker]) {
  const url = new URL(NAVER_NEWS_API);
  url.searchParams.set("query", query);
  url.searchParams.set("display", "100");
  url.searchParams.set("format", "json");
  url.searchParams.set("sort", "date");
  const response = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": env.NAVER_CLIENT_ID,
      "X-NCP-APIGW-API-KEY": env.NAVER_CLIENT_SECRET,
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error("Naver news API status " + response.status);
  const payload = await response.json();
  if (!Array.isArray(payload.items)) throw new Error("Invalid Naver news response");
  items.push(...payload.items);
  }
  return items;
}

async function pollTopic(env, ticker, now) {
  const items = await searchNews(env, ticker);
  const baseline = await env.DB.prepare(
    "SELECT initialized_at FROM topic_state WHERE ticker = ?"
  ).bind(ticker).first();

  const articles = items
    .map((item) => normalizeArticle(item, ticker, now))
    .filter((item) => item && (!baseline || item.publishedAt >= now - FRESHNESS_MS));

  const writes = articles.map((item) => env.DB.prepare(
    "INSERT OR IGNORE INTO articles " +
    "(url, ticker, title, pub_ms, discovered_ms, sent_ms, lease_until_ms) " +
    "VALUES (?, ?, ?, ?, ?, ?, NULL)"
  ).bind(item.url, item.ticker, item.title, item.publishedAt, now, baseline ? null : now));

  // For a new ticker, record current search results as seen; don't flood Telegram with old news.
  if (!baseline) {
    writes.push(env.DB.prepare(
      "INSERT OR IGNORE INTO topic_state (ticker, initialized_at) VALUES (?, ?)"
    ).bind(ticker, now));
  }
  if (writes.length) await env.DB.batch(writes);
}

async function sendPending(env, now) {
  // Atomic claim prevents overlapping cron runs from sending the same batch.
  const rows = await env.DB.prepare(
    "UPDATE articles SET lease_until_ms = ? WHERE url IN " +
    "(SELECT url FROM articles WHERE sent_ms IS NULL " +
    "AND (lease_until_ms IS NULL OR lease_until_ms < ?) " +
    "ORDER BY pub_ms ASC LIMIT ?) " +
    "RETURNING url, ticker, title"
  ).bind(now + 120_000, now, MAX_PER_ALERT).all();

  const claimed = rows.results || [];
  if (!claimed.length) return 0;
  const links = claimed.map((item) => item.url);
  const placeholders = links.map(() => "?").join(", ");
  try {
    const response = await fetch(
      TELEGRAM_API + "/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: env.TELEGRAM_CHAT_ID,
          text: formatTelegramMessage(claimed),
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(8000),
      }
    );
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error("Telegram API status " + response.status + ": " + (data.description || "unknown"));
    }
    await env.DB.prepare(
      "UPDATE articles SET sent_ms = ?, lease_until_ms = NULL WHERE url IN (" + placeholders + ")"
    ).bind(now, ...links).run();
    return claimed.length;
  } catch (error) {
    await env.DB.prepare(
      "UPDATE articles SET lease_until_ms = NULL WHERE url IN (" + placeholders + ")"
    ).bind(...links).run();
    throw error;
  }
}

export async function runNewsCheck(env, scheduledAt = Date.now()) {
  for (const field of ["DB", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
    if (!env[field]) throw new Error("Required Worker binding or secret is missing: " + field);
  }
  const now = Date.now();
  let succeeded = 0;
  for (const ticker of WATCHLIST) {
    try {
      await pollTopic(env, ticker, now);
      succeeded++;
    } catch (error) {
      console.error("Search failed for " + ticker + ": " + error.message);
    }
  }
  if (succeeded === 0) throw new Error("All news searches failed; no alert was sent.");
  const sent = await sendPending(env, now);
  // Retain one week of deduplication history, with a light cleanup every 6 hours.
  const triggerDate = new Date(scheduledAt);
  if (triggerDate.getUTCMinutes() === 0 && triggerDate.getUTCHours() % 6 === 0) {
    await env.DB.prepare("DELETE FROM articles WHERE pub_ms < ?")
      .bind(now - 7 * 24 * 60 * 60 * 1000).run();
  }
  console.log("Checked " + succeeded + "/" + WATCHLIST.length + " tickers. Sent " + sent + " articles.");
  return { checked: succeeded, sent };
}

export default {
  async scheduled(controller, env) {
    await runNewsCheck(env, controller.scheduledTime);
  },
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, purpose: "stock-news-alert", interval: "1 minute" });
    }
    return new Response("Not found", { status: 404 });
  },
};

