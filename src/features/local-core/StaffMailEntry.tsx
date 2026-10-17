import {useStaffLocale} from './StaffLocale';
import {useLayoutEffect,useRef,useState} from 'react';
import {StaffWorkspaceGate} from './StaffWorkspaceGate';
import {consumeStaffInvitationLink,type StaffInvitationLink} from './staff-invitation-link';
export function StaffMailEntry(){
 const {t}=useStaffLocale();
 const [link,setLink]=useState<StaffInvitationLink|null>(null),[password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
 const generation=useRef(0);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 useLayoutEffect(()=>{
  const receive=()=>{
   if(!window.location.hash)return;
   const next=consumeStaffInvitationLink();
   generation.current++;setBusy(false);
   setLink(next);setPassword('');setRepeat('');setError('');setDone(false);
  };
  receive();window.addEventListener('hashchange',receive);
  return ()=>window.removeEventListener('hashchange',receive);
 },[]);
 if(!link)return <>{done&&<div className="localWorkspace"><p className="localSuccess" role="status">{t("Код принят. Пароль установлен. Теперь войдите в рабочую область.")}</p></div>}<StaffWorkspaceGate/></>;
 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');if(password!==repeat){setError('Пароли не совпадают.');return;}if(!link)return;
  const submittedGeneration=generation.current;setBusy(true);
  try{
   const response=await fetch('/local-api/'+link.mode,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Views-Local-Workspace':'1'},
    body:JSON.stringify({token:link.token,password}),signal:AbortSignal.timeout(15000)});
   const body=await response.json();
   if(!response.ok)throw Error(body.error==='STAFF_PASSWORD_POLICY'?'Пароль должен содержать 15–128 символов.':
    body.error==='STAFF_ACTIVATION_INVALID'?'Ссылка истекла, уже использована или письмо ещё не принято. Запросите новое приглашение у администратора.':'Сервер не подтвердил операцию. Повторите позже.');
   if(generation.current!==submittedGeneration)return;
   setDone(true);setLink(null);
  }catch(e){if(generation.current===submittedGeneration)setError(e instanceof Error?e.message:'Не удалось подтвердить код.');}
  finally{if(generation.current===submittedGeneration){setBusy(false);setPassword('');setRepeat('');}}
 }
 return <main className="localWorkspace staffLogin"><span className="localEyebrow">{t("VIEWS · ПРИГЛАШЕНИЕ ИЗ ПИСЬМА")}</span>
  <h1>{link.mode==='activate'?t("Принять приглашение"):t("Восстановить доступ")}</h1>
  <div className="localWarning"><strong>{t("Локальный проверочный стенд.")}</strong> {' '}{t("Тестовое письмо не подтверждает владение настоящим email. Реальные письма и платежи отключены.")}</div>
  <section className="localPanel"><p>{t("Одноразовый код получен из ссылки и удалён из адресной строки. Само открытие страницы не активирует учётную запись.")}</p>
   {error&&<p className="localError" role="alert">{t(error)}</p>}
   <form onSubmit={submit}><fieldset disabled={busy}>
    <label>{t("Новый пароль")}<input aria-label={t("Новый пароль")} type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <label>{t("Повторите пароль")}<input aria-label={t("Повторите пароль")} type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={repeat} onChange={e=>setRepeat(e.target.value)}/></label>
    <button className="primary" disabled={busy}>{busy?t("Подтверждение…"):t("Установить пароль и подтвердить код")}</button>
   </fieldset></form><div className="staffAccountActions"><button disabled={busy} onClick={()=>{setLink(null);setPassword('');setRepeat('');}}>{t("Вернуться ко входу")}</button></div>
  </section></main>;
}
