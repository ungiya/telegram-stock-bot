import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { filingText, filingMessages, fetchFilingBody, unzipFiling, viewerUrl, boundedBytes } from '../src/dart-body.js';
const receipt='20261102800892';
const item={ticker:'대웅제약',report_name:'단일판매ㆍ공급계약해지',filed_date:'20261102',receipt_no:receipt};
const xml='<DOCUMENT><DOCUMENT-HEADER>metadata</DOCUMENT-HEADER><BODY><TITLE>단일판매ㆍ공급계약해지</TITLE><TABLE><TR><TD>계약상대</TD><TD>ABBOTT PRODUCTS OPERATIONS AG (Switzerland)</TD></TR><TR><TD>해지금액(원)</TD><TD>69,227,120,771</TD></TR><TR><TD>매출대비(%)</TD><TD>8.24</TD></TR></TABLE><P>사업 환경 변화에 따라 양사 합의로 계약해지</P></BODY></DOCUMENT>';
function zip(content){
 const raw=Buffer.from(content),data=deflateRawSync(raw),name=Buffer.from(receipt+'.xml');
 const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50);h.writeUInt16LE(8,8);h.writeUInt32LE(data.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);
 const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50);c.writeUInt16LE(8,10);c.writeUInt32LE(data.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(name.length,28);
 const e=Buffer.alloc(22);e.writeUInt32LE(0x06054b50);e.writeUInt16LE(1,10);e.writeUInt32LE(c.length+name.length,12);e.writeUInt32LE(h.length+name.length+data.length,16);
 return Buffer.concat([h,name,data,c,name,e]);
}
test('XML table labels, amounts and reasons survive without script or metadata',()=>{
 const body=filingText(xml+'<script>bad()</script>');
 assert.match(body,/계약상대 \| ABBOTT/);assert.match(body,/해지금액\(원\) \| 69,227,120,771/);
 assert.match(body,/매출대비\(%\) \| 8.24/);assert.doesNotMatch(body,/metadata|bad\(\)|<TD>/);
 assert.equal(filingMessages(item,body).length,1);
});
test('compressed official XML archive is decoded and malformed archives fail',async()=>{
 assert.equal(await unzipFiling(zip(xml),receipt),xml);
 await assert.rejects(unzipFiling(new Uint8Array(3),receipt));
 await assert.rejects(boundedBytes(new Blob(['123456']).stream(),4),/large/);
});
test('API document success avoids extra viewer requests',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);let calls=0;
 globalThis.fetch=async(u,o)=>{calls++;assert.equal(o.redirect,'manual');assert.match(u,/document.xml/);return new Response(zip(xml));};
 assert.match(await fetchFilingBody({DART_API_KEY:'secret'},receipt),/ABBOTT/);assert.equal(calls,1);
});
test('API redirect is not followed; fallback viewer is pinned to receipt and has no API key',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);const urls=[];
 globalThis.fetch=async(u,o)=>{urls.push(u);assert.equal(o.redirect,'manual');
  if(u.includes('opendart.'))return new Response(null,{status:302,headers:{Location:'https://evil.example/?key=secret'}});
  assert.doesNotMatch(u,/secret|crtfc_key/);
  if(u.includes('main.do'))return new Response(`viewDoc("${receipt}", "11638593", "0", "0", "0", "HTML", "");`);
  return new Response('<html><head><meta charset="utf-8"></head><body><p>'+('계약 본문 상세 내용 '.repeat(10))+'</p></body></html>'.replace('euc-kr','utf-8'));
 };
 assert.match(await fetchFilingBody({DART_API_KEY:'secret'},receipt),/계약 본문/);assert.equal(urls.length,3);
 assert.throws(()=>viewerUrl(`viewDoc("20261102800893", "1", "0", "0", "0", "HTML")`,receipt));
});
test('long filings become a single bounded summary, missing bodies remain explicit',()=>{
 const body='계약금액(원) | 100,000,000\n계약상대 | 테스트회사\n'+'기타 부연설명입니다.\n'.repeat(2000);
 const messages=filingMessages(item,body);
 assert.equal(messages.length,1);assert.ok(messages[0].length<2000);
 assert.match(messages[0],/핵심 항목/);assert.match(messages[0],/100,000,000/);
 assert.doesNotMatch(messages[0],/부연설명|본문 1/);
 assert.match(filingMessages(item,'')[0],/본문을 불러오지 못했습니다/);
});
test('legacy Korean viewer bytes are decoded before extracting body',async t=>{
 const original=globalThis.fetch;t.after(()=>globalThis.fetch=original);
 const bytes=Buffer.concat([Buffer.from('<html><head><meta charset="euc-kr"></head><body><p>'),Buffer.from(Array(40).fill([0xb0,0xa1]).flat()),Buffer.from('</p></body></html>')]);
 globalThis.fetch=async u=>u.includes('opendart.')?new Response('<status>014</status>'):
  u.includes('main.do')?new Response(`viewDoc("${receipt}", "123", "0", "0", "0", "HTML")`):new Response(bytes);
 assert.equal(await fetchFilingBody({DART_API_KEY:'test'},receipt),'가'.repeat(40));
});


test('DART HTML with no declared charset falls back from broken UTF-8 to CP949',async()=>{
  const {decodeFilingBytes}=await import('../src/dart-body.js');
  // CP949 / EUC-KR bytes for the Korean word 가나다.
  const raw=new Uint8Array([0x3c,0x62,0x6f,0x64,0x79,0x3e,
    0xb0,0xa1,0xb3,0xaa,0xb4,0xd9,0x3c,0x2f,0x62,0x6f,0x64,0x79,0x3e]);
  const decoded=decodeFilingBytes(raw);
  assert.equal(decoded,'<body>가나다</body>');
  assert.doesNotMatch(decoded,/\uFFFD/);
  const laterHeader=new Uint8Array([
    ...new TextEncoder().encode('<!--'+' '.repeat(700)+'--><meta charset="euc-kr"><p>'),
    0xb0,0xa1,0xb3,0xaa,0xb4,0xd9,...new TextEncoder().encode('</p>')]);
  assert.match(decodeFilingBytes(laterHeader),/가나다/);
  assert.equal(decodeFilingBytes(new TextEncoder().encode('<body>매출액 영업이익 정상</body>')),
    '<body>매출액 영업이익 정상</body>');
});
