// Public endpoints and parsing rules ported from reports_feed.py / broker_collect.py.
const NAVER = 'https://stock.naver.com/api/stockSecurity/researches/v2/company';
const clean = value => String(value || '').replace(/<[^>]*>/g, ' ')
  .replace(/&(?:amp|lt|gt|quot|apos|nbsp);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&nbsp;': ' ' };
    if (named[entity.toLowerCase()] !== undefined) return named[entity.toLowerCase()];
    const n = Number.parseInt(entity.slice(entity[2].toLowerCase() === 'x' ? 3 : 2, -1), entity[2].toLowerCase() === 'x' ? 16 : 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
  }).replace(/\s+/g, ' ').trim();
const decode = value => clean(String(value).replace(/</g, '&lt;').replace(/>/g, '&gt;'));
function attrs(text) {
  const result = {};
  for (const match of text.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  }
  return result;
}
function anchors(html) {
  return [...html.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a\s*>/gi)]
    .map(m => ({ ...attrs(m[1]), text: clean(m[2]) }));
}
export function safeReportUrl(value, base) {
  try {
    const url = new URL(value, base);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
export function parseTable(source, html, base, broker) {
  const result = [];
  for (const match of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    const row = match[1], date = clean(row).match(/20\d\d[-.]\d\d[-.]\d\d/);
    if (!date) continue;
    const links = anchors(row);
    let title, link;
    if (source === 'samsung') {
      const a = links.find(a => a.href?.includes('fileName='));
      if (!a) continue;
      title = (a.title || a.text).split(' PDF 원문보기')[0]; link = a.href;
    } else {
      const a = links.find(a => a.id?.startsWith('bbsTitle'));
      const pdf = links.map(a => a.href?.match(/downConfirm\('([^']+)/)).find(Boolean);
      if (!a || !pdf) continue;
      title = a.text; link = pdf[1];
    }
    const url = safeReportUrl(link, base);
    if (url) result.push({ title: clean(title), date: date[0].replaceAll('.', '-'), broker, url });
  }
  return result;
}
export function parseHana(html) {
  const matches = [...html.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a\s*>/gi)]
    .filter(m => { const a = attrs(m[1]); return a.class?.split(/\s+/).includes('more_btn') && a.class?.split(/\s+/).includes('title') && a.id; });
  const result = [];
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i], block = html.slice(m.index + m[0].length, matches[i + 1]?.index ?? html.length);
    const link = anchors(block).find(a => a.href?.includes('download.cmd?'));
    const date = clean(block).match(/20\d\d\.\d\d\.\d\d/);
    const url = link && safeReportUrl(link.href, 'https://www.hanaw.com');
    if (url && date) result.push({ title: clean(m[2]), date: date[0].replaceAll('.', '-'), broker: '하나증권', url });
  }
  return result;
}
export function parseKorea(html) {
  const result = [];
  const regex = /onclick="goDetail\('([^']+)'\)[\s\S]*?class="body_tit">([\s\S]*?)<\/span>[\s\S]*?class="tit_info">([\s\S]*?)<\/span>/g;
  for (const m of html.matchAll(regex)) {
    const date = clean(m[3]).match(/20\d\d\.\d\d\.\d\d/), url = safeReportUrl(m[1], 'https://www.truefriend.com');
    if (date && url) result.push({ title: clean(m[2]), date: date[0].replaceAll('.', '-'), broker: '한국투자증권', url });
  }
  return result;
}
export function parseNh(html) {
  const result = [];
  for (const m of html.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a\s*>/gi)) {
    const a = attrs(m[1]);
    if (!a.href?.match(/^\/research\/authCheck\?type=view&rshPprNo=\d+/)) continue;
    const title = m[2].match(/<p\b[^>]*class="tit"[^>]*>([\s\S]*?)<\/p>/i), date = clean(m[2]).match(/20\d\d\.\d\d\.\d\d/);
    if (title && date && !/AI\s*Brief/i.test(clean(title[1]))) result.push({ title: clean(title[1]), date: date[0].replaceAll('.', '-'), broker: 'NH투자증권', url: safeReportUrl(a.href, 'https://m.nhsec.com') });
  }
  return result;
}
export function parseKb(data) {
  if (!Array.isArray(data?.response?.reportList)) throw Error('Invalid KB report list');
  return data.response.reportList.filter(x => x.stkCd).map(x => ({
    title: clean((x.docTitle || '') + ' ' + (x.docTitleSub || '')), broker: 'KB증권',
    date: x.publicDate, url: safeReportUrl(decode(x.urlLink || '')),
  })).filter(x => x.url);
}

const HOSTS = new Set(['stock.naver.com', 'www.samsungpop.com', 'securities.miraeasset.com', 'www.hanaw.com', 'www.truefriend.com', 'm.nhsec.com', 'rc.kbsec.com']);
export function requestBudget(maxCalls = 40, deadline = Date.now() + 200000) {
  let used = 0;
  const request = async (address, options = {}) => {
    let url = new URL(address);
    for (let redirects = 0; redirects < 4; redirects++) {
      if (url.protocol !== 'https:' || !HOSTS.has(url.hostname)) throw Error('Unexpected report endpoint');
      if (used >= maxCalls || Date.now() >= deadline) throw Error('Report request budget exhausted');
      used++;
      const response = await fetch(url.href, { ...options, redirect: 'manual', signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0', ...options.headers } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) throw Error('Report redirect missing location');
        await response.body?.cancel();
        url = new URL(location, url);
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw Error('Report endpoint HTTP ' + response.status); }
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 3000000) throw Error('Report response too large');
      const encoding = response.headers.get('content-type')?.match(/charset\s*=\s*["']?([^\s;"']+)/i)?.[1] || options.encoding || 'utf-8';
      const text = new TextDecoder(encoding).decode(bytes);
      return options.json ? JSON.parse(text) : text;
    }
    throw Error('Too many report redirects');
  };
  request.remaining = () => maxCalls - used;
  return request;
}
export const REPORT_SOURCES = ['naver', 'samsung', 'hana', 'mirae', 'korea', 'nh', 'kb'];
export async function collectSource(source, request, now = Date.now()) {
  let rows = [];
  if (source === 'naver') {
    for (let index = 0; index < 15; index++) {
      const data = await request(NAVER + '?size=20&index=' + index, { json: true, headers: { Referer: 'https://stock.naver.com/research/company' } });
      if (!Array.isArray(data.items) || (!index && !data.items.length)) throw Error('Invalid Naver report list');
      for (const x of data.items) {
        if (x.nid === undefined || !x.itemCode || !x.itemName) continue;
        rows.push({ id: String(x.nid), itemCode: String(x.itemCode), itemName: x.itemName, title: clean(x.title), broker: x.brokerName, date: x.writeDate,
          url: 'https://stock.naver.com/research/company/' + encodeURIComponent(String(x.nid)), needsDetail: true });
      }
      if (!data.hasNext) break;
    }
  } else if (source === 'samsung') {
    for (let offset = 0; offset < 35; offset += 7) {
      const url = 'https://www.samsungpop.com/sscommon/jsp/search/research/research_pop.jsp?GUBUN=all&startCount=' + offset;
      const batch = parseTable(source, await request(url, { encoding: 'euc-kr' }), url, '삼성증권');
      if (!batch.length) throw Error('Samsung list empty');
      rows.push(...batch);
    }
  } else if (source === 'hana') rows = parseHana(await request('https://www.hanaw.com/main/research/research/list.cmd?pid=3&cid=0'));
  else if (source === 'mirae') {
    const url = 'https://securities.miraeasset.com/bbs/board/message/list.do?categoryId=1800';
    rows = parseTable(source, await request(url), url, '미래에셋증권');
  } else if (source === 'korea') {
    for (const page of [1, 2, 3]) {
      const query = new URLSearchParams({ cmd: 'TF07ae000001_List_v2_single', tab1Name: 'report', tab2Name: 'all', currentPage: String(page), searchValue: '', searchColumn: 'all', 'templet-bypass': 'true' });
      rows.push(...parseKorea(await request('https://www.truefriend.com/main/research/research/Search.jsp?' + query)));
    }
  } else if (source === 'nh') rows = parseNh(await request('https://m.nhsec.com/research/boardList?rshPprDitCd=01'));
  else if (source === 'kb') {
    const day = ms => new Date(ms + 9 * 3600000).toISOString().slice(0, 10).replaceAll('-', '');
    const body = { pageNo: 1, pageSize: 50, registdateFrom: day(now - 14 * 86400000), registdateTo: day(now), callGbn: 'RCLIST', templateid: '', folderid: '', lowTempId: '' };
    rows = parseKb(await request('https://rc.kbsec.com/ajax/categoryReportList.json', { json: true, method: 'POST', body: JSON.stringify(body), headers: { Referer: 'https://rc.kbsec.com/', 'Content-Type': 'application/json' } }));
  } else throw Error('Unknown report source');
  if (!rows.length) throw Error('Report list empty: ' + source);
  return rows;
}
export async function reportDetail(item, request) {
  const detail = await request(NAVER + '/' + encodeURIComponent(item.id), { json: true, headers: { Referer: 'https://stock.naver.com/research/company' } });
  if (String(detail.itemCode) !== item.itemCode) throw Error('Report detail company mismatch');
  const attachment = safeReportUrl(detail.attachUrl);
  return { ...item, title: clean(detail.title || item.title), broker: detail.brokerName || item.broker, date: detail.writeDate || item.date,
    url: attachment && new URL(attachment).hostname === 'stock.pstatic.net' && /\.pdf/i.test(new URL(attachment).pathname) ? attachment : item.url,
    opinion: clean(detail.opinionText), goalPrice: /^\d+$/.test(String(detail.goalPrice)) ? Number(detail.goalPrice).toLocaleString('ko-KR') : '' };
}
