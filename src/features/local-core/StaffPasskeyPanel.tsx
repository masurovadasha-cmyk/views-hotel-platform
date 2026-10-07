import {useEffect,useState} from 'react';
import {startAuthentication,startRegistration,type PublicKeyCredentialCreationOptionsJSON,type PublicKeyCredentialRequestOptionsJSON} from '@simplewebauthn/browser';
type Status={enabled:boolean;registered:boolean;verifiedUntil:string|null};
export function StaffPasskeyPanel({csrf}:{csrf:string}){
 const [status,setStatus]=useState<Status|null>(null),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function call<T>(route:string,body:unknown):Promise<T>{
  const response=await fetch('/local-api/passkey/'+route,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Views-Local-Workspace':'1','X-CSRF-Token':csrf},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Не удалось подтвердить ключ. Повторите попытку; для нового ключа проверьте текущий пароль.');
  return response.json();
 }
 useEffect(()=>{let live=true;
  if(location.hostname==='localhost')void call<Status>('state',{}).then(s=>{if(live)setStatus(s);}).catch(()=>{});
  return()=>{live=false;};
 },[csrf]);
 useEffect(()=>{if(!status?.verifiedUntil)return;
  const timer=setTimeout(()=>setStatus(s=>s?{...s,verifiedUntil:null}:s),Math.max(0,Date.parse(status.verifiedUntil)-Date.now()));
  return()=>clearTimeout(timer);
 },[status?.verifiedUntil]);
 if(!status?.enabled)return null;
 async function verify(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');
  const purpose=status?.registered?'authenticate':'register';
  try{
   const ceremony=await call<{challengeId:string;options:PublicKeyCredentialCreationOptionsJSON|PublicKeyCredentialRequestOptionsJSON}>('options',{purpose,password:purpose==='register'?password:null});setPassword('');
   const response=purpose==='register'?await startRegistration({optionsJSON:ceremony.options as PublicKeyCredentialCreationOptionsJSON}):await startAuthentication({optionsJSON:ceremony.options as PublicKeyCredentialRequestOptionsJSON});
   await call('verify',{purpose,challengeId:ceremony.challengeId,response});setStatus(await call<Status>('state',{}));
  }catch(e){setError(e instanceof DOMException&&e.name==='NotAllowedError'?'Подтверждение отменено. Можно повторить попытку.':'Ключ не подтверждён. Проверьте пароль, доступность ключа и повторите попытку.');}
  finally{setPassword('');setBusy(false);}
 }
 return <section className="localWorkspace localPanel" aria-label="Ключ доступа">
  <h2>Ключ доступа</h2><p>Проверочный режим. Ключ подтверждает вашу личность в текущей сессии и не меняет права доступа.</p>
  <p role="status">{status.verifiedUntil?'Личность подтверждена на 5 минут.':status.registered?'Ключ зарегистрирован. Подтвердите личность для текущей сессии.':'Зарегистрируйте ключ с PIN-кодом или биометрией устройства.'}</p>
  <form onSubmit={verify}><fieldset disabled={busy}>
   {!status.registered&&<label>Текущий пароль для ключа<input aria-label="Текущий пароль для ключа" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>}
   <button disabled={busy} className="primary">{busy?'Подтверждение…':status.registered?'Подтвердить ключом':'Зарегистрировать ключ'}</button>
  </fieldset></form>{error&&<p role="alert" className="localError">{error}</p>}
  <p className="localHint">Восстановление и замена ключа пока недоступны. Вход по паролю продолжает работать.</p>
 </section>;
}
