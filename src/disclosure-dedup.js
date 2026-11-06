// Shared KIND + DART notification identity. We only merge the *same type* of
// preliminary earnings disclosure for the same ticker on the same filing day.
// Separate/consolidated, correction, annual vs interim financial statements,
// and actual quarterly/annual reports remain independent notifications.
const DAY=86400000;
const dateKey=value=>{
 const s=String(value||'').replace(/\D/g,'');
 return /^\d{8}$/.test(s)&&Number(s.slice(4,6))>=1&&Number(s.slice(4,6))<=12?s:null;
};
const tidy=value=>String(value||'').normalize('NFKC')
 .replace(/<[^>]*>/g,' ').replace(/\s+/g,'').toLowerCase();
const corrected=/정정|수정신고|첨부정정|기재정정/;

export function earningsDisclosureKey({ticker,title,report_name,date,event_date,filed_date}) {
 if(!ticker)return null;
 const t=tidy(title??report_name);
 const day=dateKey(date??event_date??filed_date);
 if(!day || !t || corrected.test(t))return null;
 // "연결재무제표기준영업(잠정)실적(공정공시)" and
 // "영업(잠정)실적(공정공시)" appear in KIND and OpenDART with
 // differing spacing/fullwidth punctuation.
 const compact=t.replace(/[^가-힣a-z0-9]/g,'');
 if(!/영업잠정실적/.test(compact))return null;
 if(!/공정공시/.test(compact) && !/연결재무제표기준영업잠정실적/.test(compact))return null;
 const scope=/연결재무제표|연결기준/.test(compact)?'consolidated':'separate';
 return 'earnings-prelim:'+encodeURIComponent(String(ticker).normalize('NFKC'))+':'+day+':'+scope;
}

// DART and KIND sometimes publish the same 5%-ownership filing with different
// receipt IDs. The same company, filing day and report form (short/general)
// identify the cross-feed notice. Corrections are separate filings and must
// continue to alert. A separate company/date/type always remains distinct.
export function ownershipDisclosureKey({ticker,title,report_name,date,event_date,filed_date}) {
 if (!ticker) return null;
 const headline=tidy(title ?? report_name);
 const day=dateKey(date ?? event_date ?? filed_date);
 if (!headline || !day || corrected.test(headline)) return null;
 const compact=headline.replace(/[^가-힣a-z0-9]/g,'');
 const match=compact.match(/^주식등의대량보유상황보고서(약식)?$/);
 if (!match) return null;
 const form=match[1]?'short':'standard';
 return 'ownership-5pct:'+encodeURIComponent(String(ticker).normalize('NFKC'))+':'+day+':'+form;
}

export function sharedDisclosureKey(item) {
 return earningsDisclosureKey(item) || ownershipDisclosureKey(item);
}

// An atomic key protects even when KIND and DART cron handlers overlap.
// A failed notification releases its claim; an interrupted attempt can be
// reclaimed after a bounded TTL (no permanent silence).
export async function claimDisclosure(env,key,source,receipt,now) {
 if(!key)return {status:'not_applicable'};
 let row;
 try {
  row=await env.DB.prepare(
   'INSERT INTO disclosure_deliveries(event_key,source,receipt,claimed_ms,delivered_ms) VALUES(?,?,?,?,NULL) '+
   'ON CONFLICT(event_key) DO UPDATE SET source=excluded.source,receipt=excluded.receipt,claimed_ms=excluded.claimed_ms '+
   'WHERE disclosure_deliveries.delivered_ms IS NULL AND disclosure_deliveries.claimed_ms < ? '+
   'RETURNING event_key'
  ).bind(key,source,receipt,now,now-3*60000).first();
 } catch(error) {
  // Some Cloudflare builds deploy code before D1 migrations. Do not stop
  // KIND/DART entirely in that window. Legacy same-receipt suppression
  // remains active; cross-source protection needs migration 0012.
  if(/no such table:\s*disclosure_deliveries/i.test(String(error.message)))
   return {status:'not_applicable',reason:'migration_pending'};
  throw error;
 }
 if(row)return {status:'claimed',key,source,receipt};
 const previous=await env.DB.prepare('SELECT delivered_ms FROM disclosure_deliveries WHERE event_key=?')
  .bind(key).first();
 return {status:previous?.delivered_ms!==null&&previous?.delivered_ms!==undefined?'duplicate':'busy',key,source,receipt};
}
export async function finishDisclosure(env,claim,now) {
 if(claim?.status!=='claimed')return;
 await env.DB.prepare(
  'UPDATE disclosure_deliveries SET delivered_ms=? WHERE event_key=? AND source=? AND receipt=? AND delivered_ms IS NULL'
 ).bind(now,claim.key,claim.source,claim.receipt).run();
}
export async function releaseDisclosure(env,claim) {
 if(claim?.status!=='claimed')return;
 await env.DB.prepare(
  'DELETE FROM disclosure_deliveries WHERE event_key=? AND source=? AND receipt=? AND delivered_ms IS NULL'
 ).bind(claim.key,claim.source,claim.receipt).run();
}
