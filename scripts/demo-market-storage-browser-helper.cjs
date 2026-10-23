'use strict';
// Synthetic browser fixtures only. Production mutations go through the application.
async function ready(page){if(await page.getByTestId("demo-market-storage").count())await page.locator('[data-testid="demo-market-storage"][data-ready="true"]').waitFor();}
async function record(page){await ready(page);return page.evaluate(()=>new Promise((resolve,reject)=>{
 const req=indexedDB.open('views-demo-market',1);req.onupgradeneeded=()=>req.result.createObjectStore('ledger');req.onerror=()=>reject(req.error);
 req.onsuccess=()=>{const db=req.result,tx=db.transaction('ledger','readonly'),get=tx.objectStore('ledger').get('current');get.onsuccess=()=>resolve(get.result);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close();};
}));}
async function state(page){const r=await record(page);return r?JSON.parse(r.raw):null;}
async function seed(page,value){return page.evaluate(value=>new Promise((resolve,reject)=>{
 const req=indexedDB.open('views-demo-market',1);req.onupgradeneeded=()=>req.result.createObjectStore('ledger');req.onerror=()=>reject(req.error);
 req.onsuccess=()=>{const db=req.result,tx=db.transaction('ledger','readwrite'),store=tx.objectStore('ledger'),get=store.get('current');get.onsuccess=()=>store.put({format:1,revision:(get.result?.revision||0)+1,raw:typeof value==='string'?value:JSON.stringify(value),legacySources:get.result?.legacySources||[]},'current');tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};
}),value);}
async function failWrites(page){await page.evaluate(()=>{window.qaIdbPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){if(this.name==='ledger')throw new DOMException('Synthetic quota','QuotaExceededError');return window.qaIdbPut.apply(this,arguments);};});}
async function restoreWrites(page){await page.evaluate(()=>{IDBObjectStore.prototype.put=window.qaIdbPut;});}
module.exports={ready,record,state,seed,failWrites,restoreWrites};
