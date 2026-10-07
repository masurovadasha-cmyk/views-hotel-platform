import {useEffect,useState} from 'react';
import {StaffPasskeyPanel} from './StaffPasskeyPanel';
import {LocalCoreWorkspace} from './LocalCoreWorkspace';
import './local-core.css';
type Identity={email:string;displayName:string;role:string;permissions:string[];emailVerified:boolean;expiresAt:string};
type Session={authenticated:boolean;identity?:Identity;csrf?:string};
const messages:Record<string,string>={STAFF_LOGIN_FAILED:'Неверные данные входа или доступ сотрудника отключён.',
 STAFF_SESSION_REQUIRED:'Сессия завершена. Войдите снова.',STAFF_PASSWORD_POLICY:'Пароль: от 15 до 128 символов. Используйте уникальную длинную фразу.',
 STAFF_ACTIVATION_INVALID:'Код недействителен, уже использован или истёк. Нужен новый код от администратора.',
 STAFF_AUTH_RATE_LIMIT:'Слишком много попыток. Подождите пять минут.',STAFF_AUTH_BUSY:'Сервис входа занят. Повторите позже.',
 CORE_UNAVAILABLE:'Core недоступен. Проверьте локальный сервер.',STAFF_AUTH_NOT_ACTIVATED:'Сервис входа ещё не активирован на этом стенде.'};
async function authCall<T>(route:string,body?:unknown,csrf?:string):Promise<T>{
 const headers:Record<string,string>={'X-Views-Local-Workspace':'1'};
 if(body!==undefined)headers['Content-Type']='application/json';if(csrf)headers['X-CSRF-Token']=csrf;
 const response=await fetch('/local-api/'+route,{method:body===undefined?'GET':'POST',headers,credentials:'same-origin',
 body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const value=await response.json();if(!response.ok)throw Error(messages[value.error]||'Запрос не выполнен. Проверьте сервер и повторите вход.');return value;
}
export function StaffWorkspaceGate(){
 const [session,setSession]=useState<Session>({authenticated:false}),[loading,setLoading]=useState(true),[mode,setMode]=useState<'login'|'activate'|'reset'>('login');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[token,setToken]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [change,setChange]=useState(false),[current,setCurrent]=useState(''),[next,setNext]=useState('');
 useEffect(()=>{let alive=true;
  authCall<Session>('session').then(s=>{if(alive)setSession(s);}).catch(e=>{if(alive)setError(e.message);}).finally(()=>{if(alive)setLoading(false);});
  const expired=()=>{setSession({authenticated:false});setChange(false);setCurrent('');setNext('');setError('Сессия завершена или доступ отозван. Войдите снова.');};
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
  setBusy(true);setError('');try{await authCall('logout',{all},session.csrf);setSession({authenticated:false});setChange(false);setNotice(all?'Все ваши сессии завершены.':'Вы вышли из системы.');}
  catch(e){setError(e instanceof Error?e.message:'Не удалось завершить сессию.');}finally{setBusy(false);}
 }
 async function changePassword(e:React.FormEvent){
  e.preventDefault();setBusy(true);setError('');
  try{await authCall('password',{currentPassword:current,password:next},session.csrf);setSession({authenticated:false});setChange(false);setNotice('Пароль изменён. Все сессии отозваны. Войдите заново.');}
  catch(e){setError(e instanceof Error?e.message:'Пароль не изменён.');}finally{setBusy(false);setCurrent('');setNext('');}
 }
 if(loading)return <main className="localWorkspace"><p role="status">Проверка сессии сотрудника…</p></main>;
 if(session.authenticated&&session.identity&&session.csrf)return <>
  <section className="localWorkspace staffAccount" aria-label="Учётная запись сотрудника">
   <div><strong>{session.identity.displayName||session.identity.email}</strong><small>{session.identity.email} · {session.identity.role==='front_desk'?'Ресепшен':session.identity.role}</small>
   <small>Сессия PostgreSQL · {session.identity.emailVerified?'Email подтверждён':'Локальная проверка приглашения, не подтверждение email'}</small></div>
   <div className="staffAccountActions"><button disabled={busy} onClick={()=>setChange(v=>!v)}>Изменить пароль</button>
    <button disabled={busy} onClick={()=>void logout(true)}>Завершить все сессии</button><button disabled={busy} onClick={()=>void logout(false)}>Выйти</button></div>
   {error&&<p className="localError" role="alert">{error}</p>}
   {change&&<form onSubmit={changePassword} className="staffPasswordForm">
    <label>Текущий пароль<input aria-label="Текущий пароль" type="password" required autoComplete="current-password" value={current} onChange={e=>setCurrent(e.target.value)}/></label>
    <label>Новый пароль<input aria-label="Новый пароль" type="password" required minLength={15} maxLength={128} autoComplete="new-password" value={next} onChange={e=>setNext(e.target.value)}/></label>
    <button className="primary" disabled={busy}>Сохранить новый пароль</button></form>}
  </section>
  <StaffPasskeyPanel csrf={session.csrf}/>
  <LocalCoreWorkspace staffCsrf={session.csrf}/>
 </>;
 return <main className="localWorkspace staffLogin">
  <span className="localEyebrow">VIEWS · ВХОД СОТРУДНИКА</span>
  <h1>{mode==='login'?'Вход в рабочую область':mode==='activate'?'Активировать приглашение':'Восстановить доступ'}</h1>
  <div className="localWarning"><strong>Локальный стенд с тестовым фондом.</strong> Автоматического входа больше нет. Учётная запись, пароль, сессия и права проверяются Core. Реальные платежи отключены.</div>
  <section className="localPanel">
   <p className="localHint">{mode==='login'?'Доступ только по приглашению. Самостоятельная регистрация и выбор роли запрещены.':'Введите одноразовый код, выданный администратором. На этом стенде приглашения выдаются локально — письма не отправляются.'}</p>
   {error&&<p className="localError" role="alert">{error}</p>}{notice&&<p className="localSuccess" role="status">{notice}</p>}
   <form onSubmit={submit}><fieldset disabled={busy}>
    {mode==='login'?<label>Email сотрудника<input aria-label="Email сотрудника" type="email" autoComplete="username" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></label>:
      <label>Код приглашения или восстановления<input aria-label="Код приглашения или восстановления" type="password" autoComplete="off" required minLength={64} maxLength={64} value={token} onChange={e=>setToken(e.target.value.trim())}/></label>}
    <label>Пароль<input aria-label="Пароль" type="password" autoComplete={mode==='login'?'current-password':'new-password'} required minLength={mode==='login'?1:15} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {mode!=='login'&&<label>Повторите пароль<input aria-label="Повторите пароль" type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={repeat} onChange={e=>setRepeat(e.target.value)}/></label>}
    <button className="primary" disabled={busy}>{busy?'Проверка…':mode==='login'?'Войти':mode==='activate'?'Активировать доступ':'Установить новый пароль'}</button>
   </fieldset></form>
   <div className="staffAccountActions">{(['login','activate','reset'] as const).filter(v=>v!==mode).map(v=><button key={v} disabled={busy} onClick={()=>{setMode(v);setError('');setPassword('');setRepeat('');setToken('');}}>
    {v==='login'?'Вернуться ко входу':v==='activate'?'У меня есть приглашение':'Есть код восстановления'}</button>)}</div>
  </section>
  <p className="localHint">Приложение не сохраняет пароль в браузерное хранилище; в БД хранится только защищённый хеш. Вход руководителя и администратора с расширенными правами пока закрыт до подключения MFA и подтверждения email.</p>
  <a href="/?api=demo">Открыть отдельный демо-интерфейс</a>
 </main>;
}
