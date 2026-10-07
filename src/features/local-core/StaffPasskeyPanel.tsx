import {useEffect,useState} from 'react';
import {startAuthentication,startRegistration,type PublicKeyCredentialCreationOptionsJSON,type PublicKeyCredentialRequestOptionsJSON} from '@simplewebauthn/browser';
type Status={enabled:boolean;registered:boolean;verifiedUntil:string|null;recoveryCodesRemaining:number};
export function StaffPasskeyPanel({csrf}:{csrf:string}){
 const [codes,setCodes]=useState<string[]>([]),[recoveryPassword,setRecoveryPassword]=useState(''),[recoveryCode,setRecoveryCode]=useState('');
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
 useEffect(()=>{
  const clear=()=>setCodes([]);window.addEventListener('pagehide',clear);
  const timeout=codes.length?setTimeout(clear,300000):undefined;
  return()=>{window.removeEventListener('pagehide',clear);if(timeout)clearTimeout(timeout);};
 },[codes]);
 if(!status?.enabled)return null;
 async function manage(e:React.FormEvent,action:'codes'|'replace'){
  e.preventDefault();setBusy(true);setError('');setCodes([]);
  try{
   if(action==='codes'){
    const result=await call<{recoveryCodes:string[]}>('recovery-codes',{password:recoveryPassword});setCodes(result.recoveryCodes);
    setStatus(await call<Status>('state',{}));
   }else{
    const ceremony=await call<{challengeId:string;options:PublicKeyCredentialCreationOptionsJSON}>('replace/options',{password:recoveryPassword,recoveryCode:recoveryCode.trim()||null});
    setRecoveryCode('');setRecoveryPassword('');
    const response=await startRegistration({optionsJSON:ceremony.options});
    await call('verify',{purpose:'replace',challengeId:ceremony.challengeId,response});
    window.dispatchEvent(new Event('views-staff-key-replaced'));
   }
  }catch{setError(action==='codes'?'Подтвердите действующим ключом и проверьте пароль. Если ответ потерян, запросите новый набор: предыдущие коды могли быть отменены.':'Не удалось подтвердить замену. Войдите заново и проверьте ключ; использованный резервный код повторно не подходит.');}
  finally{setRecoveryPassword('');setRecoveryCode('');setBusy(false);}
 }
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
  {status.registered&&<>
   <h3>Резервные коды</h3><p>Доступно кодов: {status.recoveryCodesRemaining}. Новый набор отменяет предыдущий. Для выдачи сначала подтвердите личность действующим ключом.</p>
   <form onSubmit={e=>void manage(e,'codes')}><fieldset disabled={busy}>
    <label>Пароль для резервных кодов<input aria-label="Пароль для резервных кодов" type="password" autoComplete="current-password" required maxLength={128} value={recoveryPassword} onChange={e=>setRecoveryPassword(e.target.value)}/></label>
    <button disabled={busy}>Выдать новые резервные коды</button>
   </fieldset></form>
   {codes.length>0&&<div aria-label="Новые резервные коды"><p>Сохраните коды в безопасном месте. Каждый подходит один раз. После закрытия или перезагрузки их нельзя посмотреть снова; срок действия — 180 дней.</p>
    <ul>{codes.map(code=><li key={code}><code>{code}</code></li>)}</ul><button onClick={()=>setCodes([])}>Я сохранил коды — скрыть</button></div>}
   <h3>Замена или восстановление ключа</h3>
   <p>Подтвердите действующим ключом или введите резервный код. После регистрации нового ключа старый ключ и все коды будут отменены, все сессии завершатся. Отмена регистрации сохраняет старый ключ, но уже принятый код остаётся использованным.</p>
   <form onSubmit={e=>void manage(e,'replace')}><fieldset disabled={busy}>
    <label>Пароль для замены ключа<input aria-label="Пароль для замены ключа" type="password" autoComplete="current-password" required maxLength={128} value={recoveryPassword} onChange={e=>setRecoveryPassword(e.target.value)}/></label>
    <label>Резервный код, если ключ недоступен<input aria-label="Резервный код" type="password" autoComplete="off" maxLength={64} value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value)}/></label>
    <button disabled={busy}>Заменить ключ и завершить все сессии</button>
   </fieldset></form><p className="localHint">Если нет ни ключа, ни кода, восстановление пока недоступно. Вход по паролю сам по себе не заменяет ключ.</p>
  </>}
 </section>;
}
