import {exhibitionNeedsContext,exhibitionHasIdentity} from './expo-events.js';
const LIMIT=512*1024;
function plain(html) {
 return html.replace(/<(script|style|aside)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
   .replace(/<[^>]*>/g,' ').replace(/&#(x[\da-f]+|\d+);/gi,(_,n)=>{
    const cp=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);
    return cp>0&&cp<=0x10ffff?String.fromCodePoint(cp):' ';
   }).replace(/&(?:nbsp|amp|quot|apos|middot|lt|gt);/g,m=>({'&nbsp;':' ','&amp;':'&','&quot;':'"','&apos;':"'",'&middot;':'·','&lt;':'<','&gt;':'>'})[m])
   .replace(/\s+/g,' ').trim();
}
// Extract only the article body, excluding unrelated headlines in sidebars.
export function articleContext(html) {
 const open=/<(div|article|section)\b[^>]*(?:id=["']article-view-content-div["']|itemprop=["']articleBody["'])[^>]*>/i.exec(html);
 if(open) {
  const tag=open[1],begin=open.index+open[0].length;
  const tokens=new RegExp('<\\/?'+tag+'\\b[^>]*>','gi');tokens.lastIndex=begin;
  let depth=1,token;
  while((token=tokens.exec(html))) {
   if(/^<\//.test(token[0]))depth--;else if(!/\/>$/.test(token[0]))depth++;
   if(!depth)return plain(html.slice(begin,token.index)).slice(0,8000);
  }
 }
 for(const m of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
  try {
   const root=JSON.parse(m[1]),objects=Array.isArray(root)?root:[root,...(root['@graph']||[])];
   for(const o of objects)if(typeof o.articleBody==='string')return plain(o.articleBody).slice(0,8000);
  }catch { /* Do not interpret JavaScript or incomplete structured data. */ }
 }
 return '';
}
async function readBounded(response) {
 if(Number(response.headers.get('content-length'))>LIMIT)throw Error('article too large');
 const reader=response.body?.getReader();if(!reader)throw Error('empty article');
 const chunks=[];let size=0;
 try {
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>LIMIT)throw Error('article too large');chunks.push(value);}
 }finally{await reader.cancel().catch(()=>{});}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 return new TextDecoder('utf-8').decode(bytes);
}
export async function enrichNewsEvent(item,request=fetch) {
 if(!exhibitionNeedsContext(item))return {item,held:false};
 try {
  let url=new URL(item.url);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('invalid article URL');
  const original=url.hostname.replace(/^www\./,'');
  const signal=AbortSignal.timeout(4000);
  for(let hop=0;hop<3;hop++) {
   const response=await request(url.href,{redirect:'manual',signal,headers:{Accept:'text/html'}});
   if(response.status>=300&&response.status<400) {
    const next=new URL(response.headers.get('location'),url);await response.body?.cancel();
    if(!['http:','https:'].includes(next.protocol)||next.hostname.replace(/^www\./,'')!==original)throw Error('article redirect changed host');
    url=next;continue;
   }
   if(!response.ok||!/(?:text\/html|application\/xhtml)/i.test(response.headers.get('content-type')||''))throw Error('article unavailable');
   const context=articleContext(await readBounded(response));
   const match=context.match(/\b[a-z][a-z0-9-]*(?:xpo|expo|fair)\b|\b(?:CES|MWC)\b|빛가람\s*(?:국제\s*전력\s*기술\s*)?엑스포|빅스포|[가-힣]{2,25}(?:박람회|엑스포)/i);
   if(!match)throw Error('exhibition identity unavailable');
   // Put the identifying passage first for classifiers with bounded lead windows.
   const passage=context.slice(Math.max(0,match.index-120),match.index+700);
   const compared={...item,description:item.ticker+' '+passage+'\n'+item.description};
   if(!exhibitionHasIdentity(compared))throw Error('exhibition identity unavailable');
   return {item:compared,held:false};
  }
 }catch { /* Hold an unidentified exhibition article; do not guess it is new. */ }
 return {item,held:true};
}
