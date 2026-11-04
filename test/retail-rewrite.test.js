import test from 'node:test';
import assert from 'node:assert/strict';
import {coveredNewsEvent} from '../src/news-dedup.js';
import {queuedNewsExcluded,normalizeArticle} from '../src/worker.js';
test('actual Hankooki screenshot is excluded on ingestion and from pending queue',()=>{
 const pub_ms=Date.parse('2026-11-04T10:00:00+09:00');
 const title='아마존서 샤퍼스까지…에이피알, 캐나다 뷰티시장 공략 속도';
 const description='에이피알이 캐나다 주요 유통업체와 잇따라 손잡으며 북미 시장 공략에 속도를 내고 있다. 에이피알은 뷰티 브랜드 메디큐브가 지난달 캐나다 최대 드럭스토어 체인인 샤퍼스 드럭 마트(Shoppers Drug...';
 const url='https://daily.hankooki.com/news/articleView.html?idxno=1421531';
 const item={title,description,url,ticker:'에이피알',pub_ms};
 assert.equal(coveredNewsEvent(item),'event:apr-medicube-canada-shoppers-1300-2026-11-04');
 assert.equal(queuedNewsExcluded(item),true);
 assert.equal(normalizeArticle({title,description,originallink:url,pubDate:new Date(pub_ms).toUTCString()},'에이피알',pub_ms+60000),null);
 assert.equal(coveredNewsEvent({...item,title:'에이피알 캐나다 매출 100억원 달성'}),null);
});
