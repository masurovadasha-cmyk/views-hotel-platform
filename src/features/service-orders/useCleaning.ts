import {useEffect,useRef,useState} from 'react';
import {retryable,type Attempt} from './model';
export function useCleaning(send:(a:Attempt)=>Promise<unknown>,refresh:()=>Promise<void>,onPending?:(v:boolean)=>void,onExpired?:()=>void){
 const [pending,setPending]=useState<Attempt|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');const lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{onPending?.(!!pending);const guard=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};if(pending)window.addEventListener('beforeunload',guard);return()=>window.removeEventListener('beforeunload',guard);},[pending,onPending]);
 async function act(a:Attempt){
  if(lock.current||!navigator.onLine)return;lock.current=true;setBusy(true);setPending(a);setMessage('');
  try{await send(a);if(!alive.current)return;setPending(null);setMessage('saved');try{await refresh();}catch{setMessage('unavailable');}}
  catch(e){if(!alive.current)return;const code=e instanceof Error?e.message:'';if(/^(GUEST_EMAIL_SESSION_INVALID|SERVICE_SESSION_INVALID|STAFF_SESSION_REQUIRED)$/.test(code)){setPending(null);onExpired?.();}else if(!retryable(code)){setPending(null);setMessage('failed');}else setMessage('uncertain');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return {pending,busy,message,act};
}
