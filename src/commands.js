import { newsPlan } from './news-schedule.js';
import { ALIASES } from './watchlist.js';
import { norm } from './filters.js';

export async function telegram(env, method, params = {}) {
  // Never log request URLs or caught fetch errors: URLs contain the bot token.
  let response;
  try {
    response = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/' + method, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params), signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error('Telegram ' + method + ' network request failed');
  }
  let data;
  try { data = await response.json(); } catch { throw new Error('Telegram invalid response'); }
  if (!response.ok || !data.ok) {
    const error = new Error('Telegram ' + method + ' status ' + response.status);
    error.status = response.status;
    throw error;
  }
  return data.result;
}

export async function liveWatchlist(env) {
  const companies = new Map(Object.entries(ALIASES));
  const rows = await env.DB.prepare('SELECT ticker, aliases_json, enabled FROM watchlist_overrides').all();
  for (const row of rows.results || []) {
    if (row.enabled) companies.set(row.ticker, JSON.parse(row.aliases_json));
    else companies.delete(row.ticker);
  }
  return companies;
}

export function parseCommand(text) {
  const match = String(text || '').trim().match(/^\/?(list|add|remove|status|pause|resume|start|help)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]*))?$/i);
  return match ? { name: match[1].toLowerCase(), arg: (match[2] || '').trim() } : null;
}

export async function authorized(env, message) {
  if (!message?.from?.id || message.from.is_bot || message.sender_chat) return false;
  const destination = String(env.TELEGRAM_CHAT_ID).trim();
  const sender = String(message.from.id);
  if (message.chat?.type !== 'private' || String(message.chat.id) !== sender) return false;
  if (/^[1-9]\d*$/.test(destination)) return sender === destination;
  // Channel/group delivery: verify the DM sender is an administrator of that destination.
  if (!/^-[1-9]\d*$/.test(destination) && !/^@[A-Za-z0-9_]+$/.test(destination)) return false;
  try {
    const member = await telegram(env, 'getChatMember', { chat_id: destination, user_id: message.from.id });
    return member.status === 'creator' || member.status === 'administrator';
  } catch (error) {
    if (error.status === 400 || error.status === 403) return false;
    throw error;
  }
}

const help = '클라우드 뉴스봇\n/list 목록\n/add 회사명\n/remove 회사명\n/status 상태\n/pause 뉴스·리포트·공시·예비심사 전송 정지\n/resume 재개\n명령은 매분 확인하므로 응답까지 약 1분 걸릴 수 있습니다.';

export async function handleCommand(env, message, command) {
  if (!await authorized(env, message)) return;
  const companies = await liveWatchlist(env);
  let reply;
  if (command.name === 'list') {
    reply = '클라우드 관심 종목 ' + companies.size + '개\n' + [...companies.keys()].join('\n');
  } else if (command.name === 'status') {
    const state = await env.DB.prepare('SELECT * FROM bot_runtime WHERE id = 1').first();
    reply = '클라우드 실행 중 · 뉴스 검색 주기 ' + newsPlan(companies).minutes + '분 (자동)\n종목: ' + companies.size + '개\n뉴스 전송: ' + (state.paused ? '일시정지' : '켜짐');
    reply += '\n뉴스 필터 버전: 2026-11-02-RUDI-LUDI-v2';
    if (state.last_checked_ms) reply += '\n최근 검색: ' + new Date(state.last_checked_ms).toISOString() + '\n검색 성공: ' + state.last_checked_count + '개 · 발송: ' + state.last_sent_count + '건';
    const reports = await env.DB.prepare('SELECT last_summary FROM report_runtime WHERE id = 1').first();
    reply += '\n리포트: 매일 08:00 / 18:00 / 23:00 (한국시간)부터 수집\n' + (reports?.last_summary || '첫 수집 대기 중');
    const kind = await env.DB.prepare('SELECT last_summary FROM kind_runtime WHERE id = 1').first();
    reply += '\nKIND 공시·예비심사: ' + (kind?.last_summary || '첫 확인 대기 중');
    const kindErrors = (await env.DB.prepare('SELECT source,last_error FROM kind_sources WHERE last_error IS NOT NULL').all()).results || [];
    for (const row of kindErrors) reply += '\nKIND 오류: ' + row.source + ' · ' + row.last_error;
    const dart = await env.DB.prepare('SELECT last_summary FROM dart_runtime WHERE id = 1').first();
    reply += '\n공시: ' + (env.DART_API_KEY ? (dart?.last_summary || '인증키 등록됨 · 첫 확인 대기 중') : 'DART_API_KEY 등록 대기');
  } else if (command.name === 'pause' || command.name === 'resume') {
    await env.DB.prepare('UPDATE bot_runtime SET paused = ? WHERE id = 1').bind(command.name === 'pause' ? 1 : 0).run();
    reply = command.name === 'pause' ? '뉴스·리포트·공시·예비심사 전송을 일시정지했습니다. 검색은 계속합니다. /resume 재개' : '뉴스·리포트·공시·예비심사 전송을 재개했습니다.';
  } else if (command.name === 'add' || command.name === 'remove') {
    if (!command.arg || command.arg.length > 80 || !norm(command.arg) || /[\r\n\x00-\x1f]/.test(command.arg)) {
      reply = '사용법: /' + command.name + ' 회사명 (한 번에 한 종목, 80자 이내)';
    } else {
      const all = new Map([...Object.entries(ALIASES), ...companies]);
      const key = [...all].find(([name, aliases]) => [name, ...aliases].some(alias => norm(alias) === norm(command.arg)))?.[0] || command.arg;
      const aliases = all.get(key) || [key];
      if (command.name === 'remove' && !companies.has(key)) reply = key + '은 현재 목록에 없습니다.';
      else if (command.name === 'add' && companies.has(key)) reply = key + '은 이미 등록돼 있습니다.';
      else if (command.name === 'add' && companies.size >= 100) reply = '최대 100개까지 등록할 수 있습니다.';
      else {
        const writes = [env.DB.prepare('INSERT INTO watchlist_overrides (ticker, aliases_json, enabled) VALUES (?, ?, ?) ON CONFLICT(ticker) DO UPDATE SET aliases_json = excluded.aliases_json, enabled = excluded.enabled')
          .bind(key, JSON.stringify(aliases), command.name === 'add' ? 1 : 0)];
        if (command.name === 'remove') {
          writes.push(env.DB.prepare('UPDATE articles SET sent_ms = ?, lease_until_ms = NULL WHERE ticker = ? AND sent_ms IS NULL').bind(Date.now(), key));
          writes.push(env.DB.prepare('UPDATE report_alerts SET sent_ms = ? WHERE ticker = ? AND sent_ms IS NULL').bind(Date.now(), key));
          writes.push(env.DB.prepare('UPDATE report_items SET processed = 1 WHERE ticker = ? AND processed = 0').bind(key));
          writes.push(env.DB.prepare('UPDATE dart_filings SET sent_ms = ? WHERE ticker = ? AND sent_ms IS NULL').bind(Date.now(), key));
          writes.push(env.DB.prepare('UPDATE kind_items SET sent_ms = ? WHERE ticker = ? AND sent_ms IS NULL').bind(Date.now(), key));
          writes.push(env.DB.prepare('DELETE FROM kind_topics WHERE ticker = ?').bind(key));
          writes.push(env.DB.prepare('DELETE FROM dart_topics WHERE ticker = ?').bind(key));
          writes.push(env.DB.prepare('DELETE FROM topic_state WHERE ticker = ?').bind(key));
        }
        await env.DB.batch(writes);
        reply = command.name === 'add' ? key + ' 추가 완료. 첫 검색은 기존 기사만 기록하고 이후 새 기사부터 알립니다.' : key + ' 삭제 완료. 이후 검색에서 제외합니다.';
      }
    }
  } else reply = help;
  // Keep each response within Telegram's message limit even with a large list.
  for (let i = 0; i < reply.length; i += 3500) {
    await telegram(env, 'sendMessage', { chat_id: message.chat.id, text: reply.slice(i, i + 3500) });
  }
}

export async function pollCommands(env) {
  const state = await env.DB.prepare('SELECT next_update_id FROM bot_runtime WHERE id = 1').first();
  const webhook = await telegram(env, 'getWebhookInfo');
  if (webhook.url) throw new Error('Telegram webhook is active; commands were not polled');
  const firstRun = state.next_update_id === null;
  const updates = await telegram(env, 'getUpdates', {
    offset: firstRun ? -1 : state.next_update_id, timeout: 0, limit: firstRun ? 1 : 5,
    allowed_updates: ['message'],
  });
  if (firstRun) {
    // Establish a cursor; never replay historical add/remove commands from Termux.
    const next = updates.length ? Math.max(...updates.map(u => u.update_id)) + 1 : 0;
    await env.DB.prepare('UPDATE bot_runtime SET next_update_id = ? WHERE id = 1').bind(next).run();
    console.log('Cloud commands initialized; send a new /list to the bot');
    return;
  }
  for (const update of updates) {
    const command = parseCommand(update.message?.text);
    if (command) await handleCommand(env, update.message, command);
    await env.DB.prepare('UPDATE bot_runtime SET next_update_id = ? WHERE id = 1').bind(update.update_id + 1).run();
  }
}

export async function withBotLock(env, task) {
  const owner = crypto.randomUUID();
  const now = Date.now();
  const lock = await env.DB.prepare('UPDATE bot_runtime SET lock_owner = ?, lock_until_ms = ? WHERE id = 1 AND lock_until_ms < ? RETURNING id')
    .bind(owner, now + 300000, now).first();
  if (!lock) { console.log('Previous cloud tick still running; skipping overlap'); return; }
  try { return await task(); }
  finally {
    await env.DB.prepare('UPDATE bot_runtime SET lock_owner = NULL, lock_until_ms = 0 WHERE id = 1 AND lock_owner = ?').bind(owner).run();
  }
}
