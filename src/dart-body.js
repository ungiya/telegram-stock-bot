import { summarizeFiling, SUMMARY_MARKER } from './dart-summary.js';
// Plain-text filing bodies. Never execute document scripts or forward API keys
// to redirects. Bounded reads protect the news worker from oversized reports.
const MAX_BYTES = 8 * 1024 * 1024;
export async function boundedBytes(stream, limit = MAX_BYTES) {
  if (!stream) throw Error('empty body');
  const reader = stream.getReader(), chunks=[]; let size=0;
  try {
    for (;;) { const {done,value}=await reader.read(); if(done) break;
      size+=value.length; if(size>limit) { await reader.cancel(); throw Error('document too large'); } chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const out=new Uint8Array(size); let offset=0;
  for(const chunk of chunks){out.set(chunk,offset);offset+=chunk.length;} return out;
}
function decode(bytes) {
  const header=new TextDecoder().decode(bytes.slice(0,500));
  const encoding=/encoding\s*=\s*["']([^"']+)|charset\s*=\s*["']?([^\s"'>;]+)/i.exec(header);
  const label=encoding?.[1] || encoding?.[2] || 'utf-8';
  return new TextDecoder(/euc-kr|ks_c_5601|cp949/i.test(label)?'euc-kr':'utf-8').decode(bytes);
}
export function filingText(markup) {
  let s=String(markup).replace(/<!--[\s\S]*?-->/g,'')
    .replace(/<(script|style|head|DOCUMENT-HEADER)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'');
  const body=/<(?:body|DOCUMENT-BODY)\b[^>]*>([\s\S]*?)<\/(?:body|DOCUMENT-BODY)>/i.exec(s);
  if(body)s=body[1];
  s=s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')
    .replace(/<br\b[^>]*\/?\s*>/gi,'\n')
    .replace(/<\/(?:td|th|te)\s*>/gi,' | ')
    .replace(/<\/(?:tr|p|div|title|subtitle|section|table|li|h[1-6])\s*>/gi,'\n')
    .replace(/<[^>]+>/g,'')
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return c>0&&c<=0x10ffff?String.fromCodePoint(c):'';})
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/g,(_,n)=>({nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[n]);
  return s.split(/\r?\n/).map(l=>l.replace(/[\t \u00a0]+/g,' ').replace(/(?:\s*\|\s*)+$/,'').trim()).filter(Boolean).join('\n');
}
export async function unzipFiling(bytes, receipt) {
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw Error('not ZIP');
  let pos=v.getUint32(end+16,true);const count=v.getUint16(end+10,true), entries=[];
  for(let i=0;i<count;i++){
    if(pos+46>bytes.length||v.getUint32(pos,true)!==0x02014b50)throw Error('invalid ZIP');
    const nameLength=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true);
    const name=new TextDecoder().decode(bytes.slice(pos+46,pos+46+nameLength));
    if(/\.(xml|html?)$/i.test(name))entries.push({name,flags:v.getUint16(pos+8,true),method:v.getUint16(pos+10,true),size:v.getUint32(pos+20,true),raw:v.getUint32(pos+24,true),offset:v.getUint32(pos+42,true)});
    pos+=46+nameLength+extra+comment;
  }
  const e=entries.find(x=>x.name===receipt+'.xml') || (entries.length===1?entries[0]:null);
  if(!e||e.raw>MAX_BYTES||e.flags&1)throw Error('unsupported document archive');
  const o=e.offset;if(o+30>bytes.length||v.getUint32(o,true)!==0x04034b50)throw Error('invalid ZIP entry');
  const start=o+30+v.getUint16(o+26,true)+v.getUint16(o+28,true);
  if(start+e.size>bytes.length)throw Error('truncated ZIP');
  const compressed=bytes.slice(start,start+e.size);
  const raw=e.method===0?compressed:e.method===8?await boundedBytes(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))):null;
  if(!raw||raw.length!==e.raw)throw Error('invalid document size');
  return decode(raw);
}
async function get(url,signal){
  const r=await fetch(url.toString(),{method:'GET',redirect:'manual',signal,headers:{Accept:'*/*','User-Agent':'telegram-stock-news-alert/1.0 (OpenDART client)'}});
  if(!r.ok){await r.body?.cancel();throw Error('document unavailable');}
  return boundedBytes(r.body);
}
export function viewerUrl(html,receipt){
  // Use only a literal viewer call for this receipt, never evaluate JavaScript.
  for(const m of html.matchAll(/viewDoc\s*\(\s*["'](\d{14})["']\s*,\s*["'](\d+)["']\s*,\s*["'](\d+)["']\s*,\s*["'](\d+)["']\s*,\s*["'](\d+)["']\s*,\s*["']([a-zA-Z0-9.]+)["']/g)){
    if(m[1]!==receipt)continue;
    return new URL('https://dart.fss.or.kr/report/viewer.do?'+new URLSearchParams({rcpNo:m[1],dcmNo:m[2],eleId:m[3],offset:m[4],length:m[5],dtd:m[6]}));
  }
  throw Error('viewer not found');
}
export async function fetchFilingBody(env,receipt){
  if(!/^\d{14}$/.test(receipt))throw Error('invalid receipt');
  const signal=AbortSignal.timeout(20000);
  try{
    const url=new URL('https://opendart.fss.or.kr/api/document.xml');
    url.search=new URLSearchParams({crtfc_key:String(env.DART_API_KEY).trim(),rcept_no:receipt});
    const body=filingText(await unzipFiling(await get(url,signal),receipt));
    if(body.length<30)throw Error('empty document');
    return body;
  }catch{/* Exchange filings or API failures can still have a public HTML body. */}
  const main=decode(await get(new URL('https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+receipt),signal));
  const html=decode(await get(viewerUrl(main,receipt),signal));
  if(!/<(?:table|p)\b/i.test(html)||/접근이 제한|서비스 이용에 불편|비정상적인 접근/.test(html))throw Error('invalid filing body');
  const body=filingText(html);if(body.length<30)throw Error('empty document');return body;
}
export function filingMessages(item,body){
  const date=item.filed_date.replace(/^(\d{4})(\d{2})(\d{2})$/,'$1-$2-$3');
  const header='[공시] ['+item.ticker+'] '+item.report_name.slice(0,500)+'\n접수일: '+date;
  const link='https://dart.fss.or.kr/dsaf001/main.do?rcpNo='+item.receipt_no;
  const content=summarizeFiling(item.report_name, body);
  return [header+'\n\n'+SUMMARY_MARKER+'\n'+content+'\n\n'+link];
}
