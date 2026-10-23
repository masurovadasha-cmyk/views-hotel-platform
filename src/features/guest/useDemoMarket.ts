import {useEffect,useRef,useState} from 'react';
import {demoMarketKey,emptyDemoMarket,type DemoAction} from './demo-market';
import {commitDemoMarket,readDemoMarket,resolveDemoMarket,subscribeDemoMarket} from './demo-market-store';
const initial=()=>({state:emptyDemoMarket(),revision:0,conflict:false,raw:'',legacy:null as string|null,legacySources:[] as string[],blocked:true});
/** Mount only in local demo surfaces; module import never reads storage. */
export function useDemoMarket(){
 const [loaded,setLoaded]=useState(initial),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const alive=useRef(false),lock=useRef(false),generation=useRef(0);
 async function refresh(){const own=++generation.current;try{const next=await readDemoMarket(indexedDB,sessionStorage.getItem(demoMarketKey));if(alive.current&&own===generation.current)setLoaded({...next,blocked:next.conflict});}catch{if(alive.current&&own===generation.current){setLoaded(s=>({...s,blocked:true}));setError('storage');}}}
 useEffect(()=>{alive.current=true;const notify=()=>{void refresh();},unsubscribe=subscribeDemoMarket(notify);window.addEventListener('focus',notify);document.addEventListener('visibilitychange',notify);void refresh();return ()=>{alive.current=false;generation.current++;unsubscribe();window.removeEventListener('focus',notify);document.removeEventListener('visibilitychange',notify);};},[]);
 async function run(action?:DemoAction){
  if(lock.current)return false;lock.current=true;setBusy(true);generation.current++;
  try{const legacy=sessionStorage.getItem(demoMarketKey),next=action?await commitDemoMarket(indexedDB,legacy,action,loaded.revision):await resolveDemoMarket(indexedDB,legacy,loaded.revision);if(alive.current){setLoaded({...next,blocked:next.conflict});setError('');}return true;}
  catch(e){if(alive.current){setError(e instanceof Error&&['stock','limit','pending','stale','changed','conflict'].includes(e.message)?e.message:'storage');await refresh();}return false;}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return {...loaded,loading:loaded.revision===0&&!error,blocked:loaded.blocked||busy,busy,error,act:(action:DemoAction)=>run(action),resolveConflict:()=>run()};
}
