import { sameNews, DEDUP_WINDOW_MS } from './news-dedup.js';

// 겹쳐 실행되는 Cron이 같은 기사를 동시에 보내지 못하게 하는 잠금.
export async function withNewsDeliveryLock(env, task) {
  const owner = crypto.randomUUID(), now = Date.now();
  const acquired = await env.DB.prepare('UPDATE news_send_lock SET owner=?,until_ms=? WHERE id=1 AND until_ms<? RETURNING id')
    .bind(owner, now + 300000, now).first();
  if (!acquired) return 0;
  const renew = async () => {
    const current = Date.now();
    const row = await env.DB.prepare('UPDATE news_send_lock SET until_ms=? WHERE id=1 AND owner=? AND until_ms>? RETURNING id')
      .bind(current + 300000, owner, current).first();
    if (!row) throw Error('News delivery lock expired; no further messages sent');
  };
  try { return await task(renew); }
  finally { await env.DB.prepare('UPDATE news_send_lock SET owner=NULL,until_ms=0 WHERE id=1 AND owner=?').bind(owner).run(); }
}

// 같은 종목의 최근 36시간 발송 기록 (보낸 기사 = 대표 기사)
export async function recentDelivered(env, ticker, now) {
  return (await env.DB.prepare(
    'SELECT url,ticker,title,description,pub_ms FROM news_delivery WHERE ticker=? AND attempt_ms>=? ORDER BY attempt_ms DESC LIMIT 500'
  ).bind(ticker, now - DEDUP_WINDOW_MS - 3600000).all()).results || [];
}

export function findDuplicate(item, history, names = []) {
  return history.find(previous => sameNews(item, previous, names)) || null;
}

// 여러 기사를 한 메시지로 보낸다. 보내기 전에 기록을 먼저 잡아
// 타임아웃 등 결과가 불확실한 경우 자동 재전송하지 않는다 (중복 방지 우선).
export async function deliverNewsGroup(env, items, send, now = Date.now()) {
  const reserved = [];
  for (const item of items) {
    const row = await env.DB.prepare(
      "INSERT OR IGNORE INTO news_delivery(url,ticker,title,description,pub_ms,state,attempt_ms) VALUES(?,?,?,?,?,'attempting',?) RETURNING url"
    ).bind(item.url, item.ticker, item.title, item.description || '', item.pub_ms, now).first();
    if (row) reserved.push(item);
  }
  if (!reserved.length) return [];
  const urls = reserved.map(item => item.url), marks = urls.map(() => '?').join(',');
  let accepted = false;
  try {
    await send(reserved); accepted = true;
    await env.DB.prepare("UPDATE news_delivery SET state='sent',sent_ms=?,error=NULL WHERE url IN (" + marks + ')').bind(Date.now(), ...urls).run();
    return reserved;
  } catch (error) {
    if (!accepted && error.definitelyNotSent) {
      await env.DB.prepare("DELETE FROM news_delivery WHERE state='attempting' AND url IN (" + marks + ')').bind(...urls).run();
    } else {
      await env.DB.prepare("UPDATE news_delivery SET state='uncertain',error=? WHERE url IN (" + marks + ')')
        .bind(accepted ? 'accepted; ledger confirmation failed' : 'delivery outcome unknown', ...urls).run();
    }
    throw error;
  }
}
