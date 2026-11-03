// Dedicated layout for direct treasury-stock acquisitions. Section-scoped
// extraction prevents old holdings and daily order limits becoming buy amounts.
export function buybackSummary(report,body){
 if(!/자기주식\s*취득\s*결정/.test(report.replace(/[()]/g,'')) || /신탁|정정/.test(report))return null;
 const lines=body.split(/\r?\n|\s*\|\s*/).map(s=>s.trim()).filter(Boolean);
 const key=s=>s.replace(/\s/g,'');
 const section=pattern=>{
  const start=lines.findIndex(l=>/^\d{1,2}\.(?!\d)/.test(l)&&pattern.test(key(l)));
  if(start<0)return [];
  let end=start+1;while(end<lines.length&&!/^\d{1,2}\.(?!\d)/.test(lines[end]))end++;
  return lines.slice(start+1,end);
 };
 const quantity=section(/취득예정주식/),amount=section(/취득예정금액/);
 const value=(rows,type)=>{const i=rows.findIndex(l=>key(l)===type||key(l)===type+'(주)');return i>=0?rows[i+1]:null;};
 const count=value(quantity,'보통주식');if(!count||!/^[-\d,]+$/.test(count))return null;
 const money=v=>{
  if(!v||!/^\d[\d,]*$/.test(v))return '';
  const n=Number(v.replaceAll(',',''));return n>=1e8?'약 '+(Math.round(n/1e8*10)/10).toLocaleString('en-US')+'억원':n.toLocaleString('en-US')+'원';
 };
 const line=(label,q,a)=>'* '+label+'\n취득수량: '+(q==='-'?'-':q+'주')+(money(a)?' ('+money(a)+')':'');
 const output=[line('보통주',count,value(amount,'보통주식'))];
 const other=value(quantity,'기타주식');if(other&&/^[-\d,]+$/.test(other))output.push(line('기타주식',other,value(amount,'기타주식')));
 const details=[['취득목적',/취득목적/],['취득방법',/취득방법/],['중개업자',/위탁투자중개업자/],['결정일자',/취득결정일/]];
 const rows=[];
 for(const [label,pattern] of details){let v=section(pattern);if(label==='결정일자')v=v.slice(0,1);else v=v.filter(x=>!/^[-※]/.test(x));if(v.length)rows.push(label+': '+v.join(' ').slice(0,220));}
 const period=section(/취득예상기간/);const start=value(period,'시작일'),end=value(period,'종료일');
 if(start&&end)rows.push('취득기간: '+start+' ~ '+end);
 output.push(rows.join('\n'));return output.join('\n\n');
}
