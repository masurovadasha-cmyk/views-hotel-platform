import {useState} from 'react';
import {StaffWorkspaceGate} from './StaffWorkspaceGate';
import {consumeStaffInvitationLink} from './staff-invitation-link';
// Read once before rendering; fragments never go to the gateway access log.
const incoming=consumeStaffInvitationLink();
export function StaffMailEntry(){
 const [link,setLink]=useState(incoming),[password,setPassword]=useState(''),[repeat,setRepeat]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState(false);
 if(!link)return <>{done&&<div className="localWorkspace"><p className="localSuccess" role="status">Код принят. Пароль установлен. Теперь войдите в рабочую область.</p></div>}<StaffWorkspaceGate/></>;
 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');if(password!==repeat){setError('Пароли не совпадают.');return;}if(!link)return;
  setBusy(true);
  try{
   const response=await fetch('/local-api/'+link.mode,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Views-Local-Workspace':'1'},
    body:JSON.stringify({token:link.token,password}),signal:AbortSignal.timeout(15000)});
   const body=await response.json();
   if(!response.ok)throw Error(body.error==='STAFF_PASSWORD_POLICY'?'Пароль должен содержать 15–128 символов.':
    body.error==='STAFF_ACTIVATION_INVALID'?'Ссылка истекла, уже использована или письмо ещё не принято. Запросите новое приглашение у администратора.':'Сервер не подтвердил операцию. Повторите позже.');
   setDone(true);setLink(null);
  }catch(e){setError(e instanceof Error?e.message:'Не удалось подтвердить код.');}
  finally{setBusy(false);setPassword('');setRepeat('');}
 }
 return <main className="localWorkspace staffLogin"><span className="localEyebrow">VIEWS · ПРИГЛАШЕНИЕ ИЗ ПИСЬМА</span>
  <h1>{link.mode==='activate'?'Принять приглашение':'Восстановить доступ'}</h1>
  <div className="localWarning"><strong>Локальный проверочный стенд.</strong> Тестовое письмо не подтверждает владение настоящим email. Реальные письма и платежи отключены.</div>
  <section className="localPanel"><p>Одноразовый код получен из ссылки и удалён из адресной строки. Само открытие страницы не активирует учётную запись.</p>
   {error&&<p className="localError" role="alert">{error}</p>}
   <form onSubmit={submit}><fieldset disabled={busy}>
    <label>Новый пароль<input aria-label="Новый пароль" type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <label>Повторите пароль<input aria-label="Повторите пароль" type="password" autoComplete="new-password" required minLength={15} maxLength={128} value={repeat} onChange={e=>setRepeat(e.target.value)}/></label>
    <button className="primary" disabled={busy}>{busy?'Подтверждение…':'Установить пароль и подтвердить код'}</button>
   </fieldset></form><div className="staffAccountActions"><button disabled={busy} onClick={()=>{setLink(null);setPassword('');setRepeat('');}}>Вернуться ко входу</button></div>
  </section></main>;
}
