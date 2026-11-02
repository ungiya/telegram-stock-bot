import { NEWS_POLICY_VERSION } from './news-policy-version.js';
import { rawPublisherObservation, recordPublisherObservations } from './publishers.js';
import { withNewsDeliveryLock, findNewsDuplicate, deliverNewsOnce } from './news-delivery.js';
import { KIND_CRON, runKindCheck } from "./kind.js";
import { claimNewsSearch } from "./news-schedule.js";
import { DART_CRON, runDartCheck } from "./dart.js";
import { coveredNewsEvent } from "./news-dedup.js";
import { REPORT_CRON, runReportCheck } from "./reports.js";
import { liveWatchlist, pollCommands, withBotLock } from "./commands.js";
import { newsAllowed, companyNewsAllowed, analystNewsExcluded, promotionalNewsExcluded } from "./filters.js";
import { ALIASES } from "./watchlist.js";

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

export function blockedNewsSource(value) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/\.$/, "");
    return ["vegannews.co.kr", "insight.co.kr", "pinpointnews.co.kr", "metroseoul.co.kr", "emetro.co.kr", "4th.kr", "newsquest.co.kr", "megaeconomy.co.kr", "hellot.net", "ttlnews.com", "economytalk.kr"].some(domain => host === domain || host.endsWith("." + domain));
  } catch { return false; }
}

export function normalizeArticle(item, ticker, now, aliases = ALIASES[ticker] || [ticker]) {
  if (blockedNewsSource(item.originallink) || blockedNewsSource(item.link)) return null;
  const url = canonicalUrl(item.originallink || item.link);
  const title = cleanTitle(item.title);
  const publishedAt = Date.parse(item.pubDate);
  if (!url || !title || !Number.isFinite(publishedAt) || publishedAt > now + 300_000) {
    return null;
  }
  const description = cleanTitle(item.description);
  if (!newsAllowed(ticker, aliases, title, description)) return null;
  // Suppress repeatedly syndicated events before they enter the D1 send queue.
  // Preserve the dated exceptions and follow-up protections in coveredNewsEvent.
  if (coveredNewsEvent({ url, ticker, title, description, pub_ms: publishedAt })) return null;
  return { url, ticker, title, description, publishedAt };
}

export function escapeTelegramHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function formatTelegramMessage(item) {
  const heading = "[" + item.ticker + "] " + item.title.slice(0, 500);
  // Leave room for the full URL within Telegram's 4096-character text limit.
  const available = Math.max(0, 4096 - heading.length - item.url.length - 2);
  const description = (item.description || "").slice(0, Math.min(1500, available));
  return [heading, description, item.url].filter(Boolean).join("\n");
}

export async function naverError(response) {
  let data;
  try { data = await response.json(); } catch { data = {}; }
  const raw = data?.error?.errorCode ?? data?.errorCode;
  const code = raw != null && /^[A-Za-z0-9_-]{1,12}$/.test(String(raw)) ? String(raw) : "unknown";
  const meanings = { "400": "quota exceeded", "410": "throttle limited", "420": "rate limited", "429": "daily quota exceeded" };
  return new Error("Naver news API status " + response.status + " · code " + code
    + (response.status === 429 && meanings[code] ? " (" + meanings[code] + ")" : ""));
}

async function searchNews(env, ticker, aliases) {
  const items = [];
  for (const query of aliases) {
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
  if (!response.ok) throw await naverError(response);
  const payload = await response.json();
  if (!Array.isArray(payload.items)) throw new Error("Invalid Naver news response");
  items.push(...payload.items);
  }
  return items;
}

async function pollTopic(env, ticker, aliases, now, paused) {
  const items = await searchNews(env, ticker, aliases);
  const baseline = await env.DB.prepare(
    "SELECT initialized_at FROM topic_state WHERE ticker = ?"
  ).bind(ticker).first();

  const normalized = items.map(item => normalizeArticle(item, ticker, now, aliases));
  // Record first-seen original publisher URLs even when a news policy rejects
  // them. This telemetry is independent of news-delivery decisions.
  // A missing migration must never stop live alerts.
  try {
    const observations = items.map((item,i) => rawPublisherObservation(item,now,normalized[i],
      (_raw,url,pub_ms) => {
        if (blockedNewsSource(item.originallink) || blockedNewsSource(item.link)) return 'blocked_source';
        if (coveredNewsEvent({ticker,url,pub_ms,title:cleanTitle(item.title),description:cleanTitle(item.description)}))
          return 'known_event';
        return 'content_filter';
      },canonicalUrl));
    await recordPublisherObservations(env,observations,now);
  } catch {
    console.warn('Publisher statistics collection unavailable; news delivery continues');
  }
  const articles = normalized.filter(item => item && (!baseline || item.publishedAt >= now - FRESHNESS_MS));

  const writes = articles.map((item) => env.DB.prepare(
    "INSERT OR IGNORE INTO articles " +
    "(url, ticker, title, description, pub_ms, discovered_ms, sent_ms, lease_until_ms) " +
    "VALUES (?, ?, ?, ?, ?, ?, ?, NULL)"
  ).bind(item.url, item.ticker, item.title, item.description, item.publishedAt, now, baseline && !paused ? null : now));

  // For a new ticker, record current search results as seen; don't flood Telegram with old news.
  if (!baseline) {
    writes.push(env.DB.prepare(
      "INSERT OR IGNORE INTO topic_state (ticker, initialized_at) VALUES (?, ?)"
    ).bind(ticker, now));
  }
  if (writes.length) await env.DB.batch(writes);
  return normalized.filter(item => !item).length;
}

// Re-evaluate already-queued articles against the latest filtering rules.
// A newly excluded article is marked handled rather than sent on the next tick.
export function queuedNewsExcluded(item) {
  return blockedNewsSource(item.url) ||
    promotionalNewsExcluded(item.ticker, item.title, item.description) ||
    !companyNewsAllowed(item.ticker, item.title, item.description) ||
    analystNewsExcluded(item.title, item.description) ||
    Boolean(coveredNewsEvent(item));
}

async function sendPending(env, now, companies) {
  return withNewsDeliveryLock(env, renew => sendClaimedNews(env, now, companies, renew));
}

async function sendClaimedNews(env, now, companies, renew) {
  if (!companies.size) return 0;
  const active = [...companies.keys()];
  const activePlaceholders = active.map(() => "?").join(",");
  // Atomic claim prevents overlapping cron runs from sending the same batch.
  const rows = await env.DB.prepare(
    "UPDATE articles SET lease_until_ms = ? WHERE url IN " +
    "(SELECT url FROM articles WHERE sent_ms IS NULL " +
    "AND (lease_until_ms IS NULL OR lease_until_ms < ?) " +
    "AND ticker IN (" + activePlaceholders + ") " +
    "ORDER BY pub_ms ASC LIMIT ?) " +
    "RETURNING url, ticker, title, description, pub_ms"
  ).bind(now + 120_000, now, ...active, MAX_PER_ALERT).all();

  const excluded = queuedNewsExcluded;
  const blocked = (rows.results || []).filter(excluded);
  if (blocked.length) {
    await env.DB.batch(blocked.map(item => env.DB.prepare(
      "UPDATE articles SET sent_ms = ?, duplicate_of = ?, lease_until_ms = NULL WHERE url = ?"
    ).bind(now, coveredNewsEvent(item), item.url)));
  }
  const claimed = (rows.results || []).filter(item => !excluded(item))
    .sort((a, b) => a.pub_ms - b.pub_ms || a.url.localeCompare(b.url));
  let duplicateCount = blocked.filter(item => coveredNewsEvent(item)).length;
  if (!claimed.length) {
    await env.DB.prepare('UPDATE bot_runtime SET last_duplicate_count=? WHERE id=1').bind(duplicateCount).run();
    return 0;
  }
  const links = claimed.map((item) => item.url);
  const placeholders = links.map(() => "?").join(", ");
  let sent = 0;
  try {
    for (const item of claimed) {
      const covered = coveredNewsEvent(item);
      const duplicate = covered ? { url: covered } : await findNewsDuplicate(env,item,Date.now(),renew);
      if (duplicate) {
        duplicateCount++;
        console.log('News duplicate suppressed', JSON.stringify({url:item.url,matched:duplicate.url}));
        await env.DB.prepare(
          "UPDATE articles SET sent_ms = ?, duplicate_of = ?, lease_until_ms = NULL WHERE url = ?"
        ).bind(now, duplicate.url, item.url).run();
        continue;
      }
      if (sent) await new Promise(resolve => setTimeout(resolve, 1100));
      await renew();
      const delivered = await deliverNewsOnce(env, item, async () => {
        const response = await fetch(
          TELEGRAM_API + "/bot" + env.TELEGRAM_BOT_TOKEN + "/sendMessage",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: env.TELEGRAM_CHAT_ID,
              text: formatTelegramMessage(item),
              link_preview_options: { is_disabled: false, url: item.url, prefer_large_media: true },
            }),
            signal: AbortSignal.timeout(8000),
          }
        );
        const data = await response.json();
        if (!response.ok || !data.ok) {
          const failure = new Error("Telegram API status " + response.status + ": " + (data.description || "unknown"));
          failure.definitelyNotSent = data.ok === false;
          throw failure;
        }
      }, Date.now());
      await env.DB.prepare(
        "UPDATE articles SET sent_ms = ?, lease_until_ms = NULL WHERE url = ?"
      ).bind(now, item.url).run();
      if (delivered) sent++;
    }
    await env.DB.prepare('UPDATE bot_runtime SET last_duplicate_count=? WHERE id=1').bind(duplicateCount).run();
    return sent;
  } catch (error) {
    await env.DB.prepare(
      "UPDATE articles SET lease_until_ms = NULL WHERE url IN (" + placeholders + ")"
    ).bind(...links).run();
    throw error;
  }
}

export async function runNewsCheck(env, scheduledAt = Date.now(), deadline = Date.now() + 230000) {
  for (const field of ["DB", "NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]) {
    if (!env[field]) throw new Error("Required Worker binding or secret is missing: " + field);
  }
  const now = Date.now();
  const companies = await liveWatchlist(env);
  const state = await env.DB.prepare("SELECT paused, last_checked_ms FROM bot_runtime WHERE id = 1").first();
  let succeeded = 0;
  let filtered = 0;
  for (const [ticker, aliases] of companies) {
    if (Date.now() >= deadline) break;
    try {
      filtered += await pollTopic(env, ticker, aliases, now, state.paused);
      succeeded++;
    } catch (error) {
      console.error("Search failed for " + ticker + ": " + error.message);
    }
  }
  if (companies.size && succeeded === 0) throw new Error("All news searches failed; no alert was sent.");
  const sent = state.paused ? 0 : await sendPending(env, now, companies);
  await env.DB.prepare("UPDATE bot_runtime SET last_checked_ms = ?, last_checked_count = ?, last_sent_count = ?, last_filtered_count = ? WHERE id = 1").bind(now, succeeded, sent, filtered).run();
  // Retain one week of deduplication history, with a light cleanup every 6 hours.
  if (Math.floor((state.last_checked_ms || 0) / 21600000) !== Math.floor(now / 21600000)) {
    await env.DB.prepare("DELETE FROM news_delivery WHERE attempt_ms < ? AND state = 'sent'").bind(now - 30 * 86400000).run();
    await env.DB.prepare("DELETE FROM articles WHERE pub_ms < ?")
      .bind(now - 7 * 24 * 60 * 60 * 1000).run();
    try {
      await env.DB.prepare("DELETE FROM news_publisher_seen WHERE first_seen_ms < ?")
        .bind(now - 30 * 24 * 60 * 60 * 1000).run();
    } catch {
      console.warn('Publisher statistics cleanup unavailable');
    }
  }
  console.log(NEWS_POLICY_VERSION + " filtered=" + filtered + ". Checked " + succeeded + "/" + companies.size + " tickers. Sent " + sent + " articles.");
  return { checked: succeeded, sent };
}

export default {
  async scheduled(controller, env) {
    if (controller.cron === KIND_CRON) { await runKindCheck(env, controller.scheduledTime); return; }
    if (controller.cron === DART_CRON) {
      await runDartCheck(env);
      return;
    }
    if (controller.cron === REPORT_CRON) {
      await runReportCheck(env, controller.scheduledTime);
      return;
    }
    await withBotLock(env, async () => {
      const deadline = Date.now() + 230000;
      try { await pollCommands(env); }
      catch (error) { console.error("Cloud commands: " + error.message); }
      const companies = await liveWatchlist(env);
      if (await claimNewsSearch(env, companies)) await runNewsCheck(env, controller.scheduledTime, deadline);
    });
  },
  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, purpose: "stock-news-alert", interval: "adaptive news; commands and DART every minute" });
    }
    return new Response("Not found", { status: 404 });
  },
};

