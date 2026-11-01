// Reserve 20% of the published 775,000 monthly shared Search allowance.
// This is an estimate for this bot, not a reading of the provider's usage meter.
export function newsPlan(companies) {
  const queries = [...companies.values()].reduce((sum, aliases) => sum + aliases.length, 0);
  const needed = Math.max(2, Math.ceil(queries * 31 * 1440 / 620000));
  const minutes = [2, 3, 5, 10, 15, 30, 60].find(n => n >= needed) || needed;
  return { queries, minutes, monthlyEstimate: Math.ceil(queries * 31 * 1440 / minutes) };
}

export async function claimNewsSearch(env, companies, now = Date.now()) {
  if (!companies.size) return false;
  const { minutes } = newsPlan(companies);
  // Reserve before calling Naver: failures and deployments cannot bypass pacing.
  const claimed = await env.DB.prepare(
    'UPDATE news_schedule SET last_attempt_ms = ? WHERE id = 1 AND (last_attempt_ms IS NULL OR last_attempt_ms <= ?) RETURNING id'
  ).bind(now, now - minutes * 60000).first();
  return Boolean(claimed);
}
