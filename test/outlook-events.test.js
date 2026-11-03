import test from 'node:test';
import assert from 'node:assert/strict';
import {sameNews} from '../src/news-dedup.js';
const first={ticker:'에이프릴바이오',pub_ms:Date.parse('2026-11-03T00:35:00Z'),title:'“에이프릴바이오, 2027년 임상 모멘텀 본격화…새 기술수출도 기대”',description:'에이프릴바이오가 내년 주요 파이프라인의 임상 진전과 신규 기술수출을 바탕으로 새로운 성장 국면에 진입할 것이라는 분석이 나왔다. 3일 리서치·투자정보 플랫폼 에픽AI에 따르면 김선아 하나증권 연구원은...'};
const second={ticker:'에이프릴바이오',pub_ms:first.pub_ms,title:'“에이프릴바이오, 내년 새로운 기회…기술수출 신약 개발 재도전”',description:"에이프릴바이오 CI (사진=에이프릴바이오) 에이프릴바이오(397030)가 기술수출한 면역질환 신약 후보물질들이 내년 새로운 임상 개발 단계에 진입할 가능성이 제기됐다. 덴마크 룬드벡이 올해 'APB-A1'의..."};
test('user screenshot: AprilBio next-year clinical and licensing outlook is one story',()=>{
 assert.equal(sameNews(first,second),true);assert.equal(sameNews(second,first),true);
});
test('outlook grouping applies to other companies but preserves dates, assets and actual developments',()=>{
 assert.equal(sameNews({...first,ticker:'테스트바이오'},{...second,ticker:'테스트바이오'}),true);
 assert.equal(sameNews(first,{...second,ticker:'다른회사'}),false);
 assert.equal(sameNews(first,{...second,title:second.title.replace('내년','2028년')}),false);
 assert.equal(sameNews(first,{...second,title:'에이프릴바이오 APB-A1 임상 2상 결과 발표',description:'임상 결과를 발표했다.'}),false);
 assert.equal(sameNews(first,{...second,title:'에이프릴바이오 신규 기술수출 계약 체결',description:'신규 계약을 체결했다.'}),false);
 assert.equal(sameNews({...first,title:first.title+' APB-A1'}, {...second,title:second.title+' APB-R3',description:'다른 후보물질의 임상 및 기술수출 전망'}),false);
});
