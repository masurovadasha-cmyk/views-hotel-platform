import {useStaffLocale} from './StaffLocale';
import {useEffect,useState} from 'react';
import {startAuthentication,type PublicKeyCredentialRequestOptionsJSON} from '@simplewebauthn/browser';
import {StaffPasskeyPanel} from './StaffPasskeyPanel';
import {ReceptionWorkspace} from './ReceptionWorkspace';
import {LocalCoreWorkspace} from './LocalCoreWorkspace';
import './local-core.css';
type Identity={email:string;displayName:string;role:string;permissions:string[];emailVerified:boolean;expiresAt:string};
type Session={authenticated:boolean;identity?:Identity;csrf?:string};
const messages:Record<string,string>={STAFF_LOGIN_FAILED:'Неверные данные входа или доступ сотрудника отключён.',
 STAFF_SESSION_REQUIRED:'Сессия завершена. Войдите снова.',STAFF_PASSWORD_POLICY:'Пароль: от 15 до 128 символов. Используйте уникальную длинную фразу.',
 STAFF_ACTIVATION_INVALID:'Код недействителен, уже использован или истёк. Нужен новый код от администратора.',
 STAFF_AUTH_RATE_LIMIT:'Слишком много попыток. Подождите пять минут.',STAFF_AUTH_BUSY:'Сервис входа занят. Повторите позже.',
 CORE_UNAVAILABLE:'Core недоступен. Проверьте локальный сервер.',STAFF_AUTH_NOT_ACTIVATED:'Сервис входа ещё не активирован на этом стенде.'};
class StaffRequestError extends Error{constructor(readonly code:string,message:string,readonly status:number){super(message);}}
async function authCall<T>(route:string,body?:unknown,csrf?:string):Promise<T>{
 const headers:Record<string,string>={'X-Views-Local-Workspace':'1'};
 if(body!==undefined)headers['Content-Type']='application/json';if(csrf)headers['X-CSRF-Token']=csrf;
 const response=await fetch('/local-api/'+route,{method:body===undefined?'GET':'POST',headers,credentials:'same-origin',
 body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const value=await response.json();if(!response.ok)throw new StaffRequestError(value.error,messages[value.error]||'Запрос не выполнен. Проверьте сервер и повторите вход.',response.status);return value;
}
export function StaffWorkspaceGate(){
 const {t}=useStaffLocale();
 const [session,setSession]=useState<Session>({authenticated:false}),[loading,setLoading]=useState(true),[mode,setMode]=useState<'login'|'activate'|'reset'>('login');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[token,setToken]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [assurance,setAssurance]=useState(false),[changeNotice,setChangeNotice]=useState('');
 const [change,setChange]=useState(false),[current,setCurrent]=useState(''),[next,setNext]=useState('');
 useEffect(()=>{let alive=true;
  authCall<Session>('session').then(s=>{if(alive)setSession(s);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});
  const expired=()=>{setSession({authenticated:false});setChange(false);setAssurance(false);setChangeNotice('');setCurrent('');setNext('');setError('Сессия завершена или доступ отозван. Войдите снова.');};
  const replaced=()=>{expired();setError('');setNotice('Ключ заменён. Все сессии завершены. Войдите заново.');};
  window.addEventListener('views-staff-key-replaced',replaced);
  window.addEventListener('views-staff-expired',expired);return()=>{alive=false;window.removeEventListener('views-staff-expired',expired);window.removeEventListener('views-staff-key-replaced',replaced);};
 },[]);
 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');setNotice('');
  if(mode!=='login'&&password!==repeat){setError('Пароли не совпадают.');return;}
  setBusy(true);
  try{
   if(mode==='login'){const s=await authCall<Session>('login',{email,password});setSession(s);}
   else{await authCall(mode,{token,password});setMode('login');setNotice('Пароль установлен. Войдите с адресом из приглашения.');setToken('');}
  }catch(e){setError(e instanceof Error?e.message:'Ошибка входа.');}
  finally{setPassword('');setRepeat('');setBusy(false);}
 }
 async function logout(all:boolean){
  setBusy(true);setError('');try{await authCall('logout',{all},session.csrf);setSession({authenticated:false});setChange(false);setAssurance(false);setCurrent('');setNext('');setChangeNotice('');setNotice(all?'Все ваши сессии завершены.':'Вы вышли из системы.');}
  catch(e){setError(e instanceof Error?e.message:'Не удалось завершить сессию.');}finally{setBusy(false);}
 }
 async function changePassword(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');setChangeNotice('');setAssurance(false);
  try{await authCall('password',{currentPassword:current,password:next},session.csrf);setSession({authenticated:false});setChange(false);setNotice('Пароль изменён. Все сессии отозваны. Войдите заново.');}
  catch(e){
   if(e instanceof StaffRequestError&&e.code==='STAFF_ASSURANCE_REQUIRED'){
    window.dispatchEvent(new Event('views-staff-assurance-updated'));setAssurance(true);setError('Для смены пароля подтвердите личность ключом в этой сессии.');
   }else if(e instanceof StaffRequestError&&e.status<500){setError(e.message);}
   else{setSession({authenticated:false});setChange(false);setNotice('Не удалось получить подтверждение смены пароля. Он мог измениться. Попробуйте войти с новым паролем; если он не подходит — с прежним.');}
  }finally{setBusy(false);setCurrent('');setNext('');}
 }
 async function confirmPasswordKey(){
  setBusy(true);setError('');setChangeNotice('');setCurrent('');setNext('');
  try{
   const c=await authCall<{challengeId:string;options:PublicKeyCredentialRequestOptionsJSON}>('passkey/options',{purpose:'authenticate',password:null},session.csrf);
   const response=await startAuthentication({optionsJSON:c.options});
   await authCall('passkey/verify',{purpose:'authenticate',challengeId:c.challengeId,response},session.csrf);
   window.dispatchEvent(new Event('views-staff-assurance-updated'));setAssurance(false);setChangeNotice('Ключ подтверждён. Введите текущий и новый пароли ещё раз и сохраните изменение.');
  }catch{setError('Подтверждение ключом не завершено. Пароль этой попыткой не менялся. Повторите подтверждение или отмените смену пароля.');}
  finally{setBusy(false);}
 }
 if(loading)return <main className="localWorkspace"><p role="status">{t("Проверка сессии сотрудника…")}</p></main>;
 if(session.authenticated&&session.identity&&session.csrf)return <>
  <nav className="localWorkspace localNavigation" aria-label={t("Разделы рабочей области")}>
   <a href="#staff-reception">{t("Ресепшен и уборка")}</a><a href="#staff-cleaning">{t("Очередь уборки")}</a><a href="#staff-booking">{t("Бронирование")}</a><a href="#staff-security">{t("Ключи доступа")}</a><a href="#staff-account">{t("Учётная запись")}</a>
  </nav>
  <section id="staff-account" tabIndex={-1} className="localWorkspace staffAccount" aria-label={t("Учётная запись сотрудника")}>
   <div><strong>{session.identity.displayName||session.identity.email}</strong><small>{session.identity.email} · {session.identity.role==='front_desk'?t("Ресепшен"):session.identity.role}</small>
   <small>{t("Сессия PostgreSQL ·")}{' '}{session.identity.emailVerified?t("Email подтверждён"):t("Локальная проверка приглашения, не подтверждение email")}</small></div>
   <div className="staffAccountActions"><button disabled={busy} onClick={()=>{setChange(v=>!v);setCurrent('');setNext('');setAssurance(false);setChangeNotice('');setError('');}}>{t("Изменить пароль")}</button>
    <button disabled={busy} onClick={()=>void logout(true)}>{t("Завершить все сессии")}</button><button disabled={busy} onClick={()=>void logout(false)}>{t("Выйти")}</button></div>
   {error&&<p className="localError" role="alert">{t(error)}</p>}
   {change&&<div className="staffPasswordChange">
    {changeNotice&&<p role="status">{t(changeNotice)}</p>}
    {assurance&&<button disabled={busy} onClick={()=>void confirmPasswordKey()}>{t("Подтвердить ключом для смены пароля")}</button>}
    <form onSubmit={changePassword} className="staffPasswordForm"><fieldset disabled={busy||assurance}>
    <label>{t("Текущий пароль")}<input aria-label={t("Текущий пароль")} type="password" required autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)}/></label>
    <label>{t("Новый пароль")}<input aria-label={t("Новый пароль")} type="password" required minLength={15} maxLength={128} autoComplete="new-password" value={next} onChange={e=>setNext(e.target.value)}/></label>
    <button className="primary" disabled={busy||assurance}>{t("Сохранить новый пароль")}</button></fieldset></form></div>}
  </section>
  <div id="staff-security" tabIndex={-1}><StaffPasskeyPanel csrf={session.csrf}/></div>
  <div id="staff-reception" tabIndex={-1}><ReceptionWorkspace staffCsrf={session.csrf}/></div>
  <div id="staff-booking" tabIndex={-1}><LocalCoreWorkspace staffCsrf={session.csrf}/></div>
 </>;
 return <main className="localWorkspace staffLogin">
  <span className="localEyebrow">{t("VIEWS · ВХОД СОТРУДНИКА")}</span>
  <h1>{mode==='login'?t("Вход в рабочую область"):mode==='activate'?t("Активировать приглашение"):t("Восстановить доступ")}</h1>
  <div className="localWarning"><strong>{t("Локальный стенд с тестовым фондом.")}</strong> {' '}{t("Автоматического входа больше нет. Учётная запись, пароль, сессия и права проверяются Core. Реальные платежи отключены.")}</div>
  <section className="localPanel">
   <p className="localHint">{mode==='login'?t("Доступ только по приглашению. Самостоятельная регистрация и выбор роли запрещены."):t("Введите одноразовый код, выданный администратором. На этом стенде приглашения выдаются локально — письма не отправляются.")}</p>
   {error&&<p className="localError" role="alert">{t(error)}</p>}{notice&&<p className="localSuccess" role="status">{t(notice)}</p>}
   <form onSubmit={submit}><fieldset disabled={busy}>
    {mode==='login'?<label>{t("Email сотрудника")}<input aria-label={t("Email сотрудника")} type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>:
      <label>{t("Код приглашения или восстановления")}<input aria-label={t("Код приглашения или восстановления")} type="password" autoComplete="off" required minLength={64} maxLength={64} value={token} onChange={e=>setToken(e.target.value.trim())}/></label>}
    <label>{t("Пароль")}<input aria-label={t("Пароль")} type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='login'?1:15} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {mode!=='login'&&<label>{t("Повторите пароль")}<input aria-label={t("Повторите пароль")} type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={repeat} onChange={e=>setRepeat(e.target.value)}/></label>}
    <button className="primary" disabled={busy}>{busy?t("Проверка…"):mode==='login'?t("Войти"):mode==='activate'?t("Активировать доступ"):t("Установить новый пароль")}</button>
   </fieldset></form>
   <div className="staffAccountActions">{(['login','activate','reset'] as const).filter(v=>v!==mode).map(v=><button key={v} disabled={busy} onClick={()=>{setMode(v);setError('');setPassword('');setRepeat('');setToken('');}}>
    {v==='login'?t("Вернуться ко входу"):v==='activate'?t("У меня есть приглашение"):t("Есть код восстановления")}</button>)}</div>
  </section>
  <p className="localHint">{t("Приложение не сохраняет пароль в браузерное хранилище; в БД хранится только защищённый хеш. Вход руководителя и администратора с расширенными правами пока закрыт до подключения MFA и подтверждения email.")}</p>
  <a href="/?api=demo">{t("Открыть отдельный демо-интерфейс")}</a>
 </main>;
}
