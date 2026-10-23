import {emptyDemoMarket,parseDemoMarket,reduceDemoMarket,type DemoAction} from './demo-market';
export const demoMarketDatabase='views-demo-market',demoMarketObjectStore='ledger',demoMarketRecordKey='current';
export type DurableMarket={format:1;revision:number;raw:string;legacySources:string[]};
export type DemoMarketSnapshot={state:ReturnType<typeof emptyDemoMarket>;revision:number;conflict:boolean;raw:string;legacy:string|null;legacySources:string[]};
type Operation={kind:'read'}|{kind:'resolve';expectedRevision:number}|{kind:'action';action:DemoAction;expectedRevision:number};
function validRecord(value:unknown):DurableMarket{
 const r=value as DurableMarket;
 if(!r||r.format!==1||!Number.isSafeInteger(r.revision)||r.revision<1||typeof r.raw!=='string'||!Array.isArray(r.legacySources)||r.legacySources.length>100||r.legacySources.some(v=>typeof v!=='string'||v.length>1000000))throw Error('storage');
 parseDemoMarket(r.raw);for(const source of r.legacySources)parseDemoMarket(source);return r;
}
/** Pure decision executed inside the IDB readwrite transaction; never mutates its inputs. */
export function decideDemoMarket(value:unknown,legacy:string|null,op:Operation):{record:DurableMarket;snapshot:DemoMarketSnapshot;write:boolean}{
 if(legacy!==null)parseDemoMarket(legacy); // Corrupt sources are never treated as empty.
 let record=value===undefined?{format:1 as const,revision:1,raw:legacy??JSON.stringify(emptyDemoMarket()),legacySources:legacy===null?[]:[legacy]}:validRecord(value);
 let imported=value===undefined;
 // Remember an equivalent legacy copy before later device edits diverge from it.
 if(legacy!==null&&legacy===record.raw&&!record.legacySources.includes(legacy)){
  if(record.legacySources.length>=100||record.revision===Number.MAX_SAFE_INTEGER)throw Error('limit');
  record={...record,revision:record.revision+1,legacySources:[...record.legacySources,legacy]};imported=true;
 }
 const conflict=legacy!==null&&legacy!==record.raw&&!record.legacySources.includes(legacy);
 const snapshot=(r:DurableMarket,c=false)=>({state:parseDemoMarket(r.raw),revision:r.revision,conflict:c,raw:r.raw,legacy,legacySources:r.legacySources});
 if(op.kind==='read')return {record,snapshot:snapshot(record,conflict),write:imported};
 if(op.expectedRevision!==record.revision)throw Error('changed');
 if(op.kind==='resolve'){
  if(!conflict)return {record,snapshot:snapshot(record),write:imported};
  if(record.legacySources.length>=100||record.revision===Number.MAX_SAFE_INTEGER)throw Error('limit');
  const next={...record,revision:record.revision+1,legacySources:[...record.legacySources,legacy!]};
  return {record:next,snapshot:snapshot(next),write:true};
 }
 if(conflict)throw Error('conflict');
 const nextState=reduceDemoMarket(snapshot(record).state,op.action),raw=JSON.stringify(nextState);
 if(raw===record.raw)return {record,snapshot:snapshot(record),write:imported};
 if(record.revision===Number.MAX_SAFE_INTEGER)throw Error('limit');
 const next={...record,raw,revision:record.revision+1};return {record:next,snapshot:snapshot(next),write:true};
}
function openDatabase(factory:IDBFactory):Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const request=factory.open(demoMarketDatabase,1);let settled=false;
 const timer=setTimeout(()=>{settled=true;reject(Error('storage'));},5000);
 request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(demoMarketObjectStore))request.result.createObjectStore(demoMarketObjectStore);};
 request.onerror=()=>{clearTimeout(timer);reject(request.error??Error('storage'));};
 request.onsuccess=()=>{clearTimeout(timer);if(settled)request.result.close();else resolve(request.result);};
});}
/** No async gap between ledger read and write; IDB serializes competing tab transactions. */
export async function transactDurableMarket(factory:IDBFactory,legacy:string|null,operation:Operation):Promise<DemoMarketSnapshot>{
 const db=await openDatabase(factory);
 return new Promise((resolve,reject)=>{
  let result:ReturnType<typeof decideDemoMarket>|undefined,failure:unknown;
  let tx:IDBTransaction;try{tx=db.transaction(demoMarketObjectStore,'readwrite');}catch(e){db.close();reject(e);return;}
  tx.oncomplete=()=>{db.close();if(result)resolve(result.snapshot);else reject(Error('storage'));};
  tx.onabort=()=>{db.close();reject(failure??tx.error??Error('storage'));};
  tx.onerror=()=>{/* onabort reports failed writes; never publish early success. */};
  const store=tx.objectStore(demoMarketObjectStore),request=store.get(demoMarketRecordKey);
  request.onsuccess=()=>{try{result=decideDemoMarket(request.result,legacy,operation);if(result.write)store.put(result.record,demoMarketRecordKey);}catch(e){failure=e;tx.abort();}};
 });
}
const listeners=new Set<()=>void>();let channel:BroadcastChannel|null=null;
function publish(){
 // The IDB transaction has already committed. Notification failures must never
 // turn that success into a storage failure; other views can refresh on focus.
 for(const listener of listeners){try{listener();}catch{/* Keep notifying other mounted views. */}}
 try{channel?.postMessage('updated');}catch{/* Focus/visibility refresh is the fallback. */}
}
export function subscribeDemoMarket(listener:()=>void){
 listeners.add(listener);
 if(!channel&&typeof BroadcastChannel!=='undefined'){try{channel=new BroadcastChannel('views-demo-market-changes');channel.onmessage=()=>{for(const notify of listeners)notify();};}catch{/* Focus refresh still works. */}}
 return ()=>{listeners.delete(listener);if(!listeners.size){channel?.close();channel=null;}};
}
export async function readDemoMarket(factory:IDBFactory,legacy:string|null){return transactDurableMarket(factory,legacy,{kind:'read'});}
export async function commitDemoMarket(factory:IDBFactory,legacy:string|null,action:DemoAction,expectedRevision:number){const next=await transactDurableMarket(factory,legacy,{kind:'action',action,expectedRevision});publish();return next;}
export async function resolveDemoMarket(factory:IDBFactory,legacy:string|null,expectedRevision:number){const next=await transactDurableMarket(factory,legacy,{kind:'resolve',expectedRevision});publish();return next;}
