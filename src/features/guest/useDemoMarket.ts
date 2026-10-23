import {useEffect,useState} from 'react';
import {emptyDemoMarket,type DemoAction} from './demo-market';
import {commitDemoMarket,readDemoMarket,subscribeDemoMarket} from './demo-market-store';
function read(){try{return readDemoMarket(sessionStorage);}catch{return {state:emptyDemoMarket(),blocked:true};}}
/** Mount only in explicitly local demo surfaces. No storage access at module import. */
export function useDemoMarket(){
 const [loaded,setLoaded]=useState(read),[error,setError]=useState('');
 useEffect(()=>{const refresh=()=>setLoaded(read());const unsubscribe=subscribeDemoMarket(refresh);refresh();return unsubscribe;},[]);
 function act(action:DemoAction){try{const state=commitDemoMarket(sessionStorage,action);setLoaded({state,blocked:false});setError('');return true;}catch(e){setError(e instanceof Error&&['stock','limit','pending','stale'].includes(e.message)?e.message:'storage');return false;}}
 return {...loaded,error,act};
}
