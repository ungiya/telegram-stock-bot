import { sameNews } from './news-dedup.js';
const RETENTION = 30 * 86400000;

// Separate delivery serialization remains valid even if a long search tick's
// outer lock expires. Renew immediately before each outbound send.
export async function withNewsDeliveryLock(env, task) {
  const owner = crypto.randomUUID(), now=Date.now();
  const acquired = await env.DB.prepare('UPDATE news_send_lock SET owner=?,until_ms=? WHERE id=1 AND until_ms<? RETURNING id')
    .bind(owner,now+300000,now).first();
  if (!acquired) return 0;
  const renew = async () => {
    const current=Date.now();
    const row=await env.DB.prepare('UPDATE news_send_lock SET until_ms=? WHERE id=1 AND owner=? AND until_ms>? RETURNING id')
      .bind(current+300000,owner,current).first();
    if (!row) throw Error('News delivery lock expired; no further messages sent');
  };
  try { return await task(renew); }
  finally { await env.DB.prepare('UPDATE news_send_lock SET owner=NULL,until_ms=0 WHERE id=1 AND owner=?').bind(owner).run(); }
}

// Search the relevant company's history in pages; never silently drop old
// representatives simply because unrelated companies produced many articles.
export async function findNewsDuplicate(env,item,now,renew=async()=>{}) {
  const exact=await env.DB.prepare('SELECT url,state FROM news_delivery WHERE url=?').bind(item.url).first();
  if (exact) return exact;
  for (let page=0;page<50;page++) {
    await renew();
    const rows=(await env.DB.prepare(
      'SELECT url,ticker,title,description,pub_ms,attempt_ms AS seen_ms FROM news_delivery WHERE ticker=? AND attempt_ms>=? '+
      'UNION ALL SELECT a.url,a.ticker,a.title,a.description,a.pub_ms,a.sent_ms AS seen_ms FROM articles a '+
      'WHERE a.ticker=? AND a.sent_ms IS NOT NULL AND a.duplicate_of IS NULL AND a.pub_ms>=? '+
      'AND NOT EXISTS(SELECT 1 FROM news_delivery d WHERE d.url=a.url) '+
      'ORDER BY seen_ms DESC,url LIMIT 200 OFFSET ?'
    ).bind(item.ticker,now-RETENTION,item.ticker,now-RETENTION,page*200).all()).results || [];
    const duplicate=rows.find(previous=>previous.url===item.url || sameNews(item,previous));
    if (duplicate) return duplicate;
    if (rows.length<200) return null;
  }
  // Prefer a visible pause to sending unchecked stories when the safety budget
  // is exhausted. The next tick can retry; no candidate is marked sent here.
  throw Error('News duplicate history exceeds 10000 rows for a company; delivery held for review');
}

export async function deliverNewsOnce(env,item,send,now=Date.now()) {
  const reserved=await env.DB.prepare(
    "INSERT OR IGNORE INTO news_delivery(url,ticker,title,description,pub_ms,state,attempt_ms) VALUES(?,?,?,?,?,'attempting',?) RETURNING url"
  ).bind(item.url,item.ticker,item.title,item.description || '',item.pub_ms,now).first();
  if (!reserved) return false;
  let accepted=false;
  try {
    await send(); accepted=true;
    await env.DB.prepare("UPDATE news_delivery SET state='sent',sent_ms=?,error=NULL WHERE url=?").bind(Date.now(),item.url).run();
    return true;
  } catch(error) {
    if (!accepted && error.definitelyNotSent) {
      // Telegram explicitly returned ok:false; unlike a timeout, this is safe to retry.
      await env.DB.prepare("DELETE FROM news_delivery WHERE url=? AND state='attempting'").bind(item.url).run();
    } else {
      // A timeout, malformed reply, process death, or DB write failure after
      // acceptance may already have delivered. Never blindly resend it.
      await env.DB.prepare("UPDATE news_delivery SET state='uncertain',error=? WHERE url=?")
        .bind(accepted?'accepted; ledger confirmation failed':'delivery outcome unknown',item.url).run();
    }
    throw error;
  }
}
