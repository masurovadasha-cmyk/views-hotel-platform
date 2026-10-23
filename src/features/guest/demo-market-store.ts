import {emptyDemoMarket,loadDemoMarket,transactDemoMarket,type DemoAction,type DemoStorage} from './demo-market';
// Same-document subscribers only. Tabs/devices deliberately remain separate demos.
const listeners=new Set<()=>void>();
export function subscribeDemoMarket(listener:()=>void){listeners.add(listener);return ()=>{listeners.delete(listener);};}
export function readDemoMarket(storage:DemoStorage){try{return {state:loadDemoMarket(storage),blocked:false};}catch{return {state:emptyDemoMarket(),blocked:true};}}
export function commitDemoMarket(storage:DemoStorage,action:DemoAction){
 const next=transactDemoMarket(storage,action);
 for(const listener of listeners)listener();
 return next;
}
