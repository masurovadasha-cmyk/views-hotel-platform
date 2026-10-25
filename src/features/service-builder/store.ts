import {decide,type Draft} from './model';
export const databaseName='views-service-draft',storeName='draft',recordKey='current';
export async function transact(factory:IDBFactory,expected?:number,draft?:Draft):Promise<ReturnType<typeof decide>>{
 const db=await new Promise<IDBDatabase>((resolve,reject)=>{
  const req=factory.open(databaseName,1);let expired=false;
  const timer=setTimeout(()=>{expired=true;reject(Error('storage'));},5000);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(storeName))req.result.createObjectStore(storeName);};
  req.onerror=()=>{clearTimeout(timer);reject(Error('storage'));};
  req.onsuccess=()=>{clearTimeout(timer);if(expired)req.result.close();else resolve(req.result);};
 });
 return new Promise((resolve,reject)=>{
  let result:ReturnType<typeof decide>|undefined,failure:unknown;
  const tx=db.transaction(storeName,expected===undefined?'readonly':'readwrite'),store=tx.objectStore(storeName),request=store.get(recordKey);
  tx.oncomplete=()=>{db.close();result?resolve(result):reject(Error('storage'));};
  tx.onabort=()=>{db.close();reject(failure??Error('storage'));};
  tx.onerror=()=>{};
  request.onsuccess=()=>{try{result=decide(request.result,expected,draft);if(expected!==undefined&&result.revision>0)store.put(result,recordKey);}catch(e){failure=e;tx.abort();}};
 });
}
