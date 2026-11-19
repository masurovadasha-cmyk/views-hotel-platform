import {useState} from 'react';
import {guestWorkbenchScreens} from './guestWorkbenchData';
type Props={screenId:string;onNavigate:(id:string)=>void};
export function GuestWorkbench({screenId,onNavigate}:Props){
 const [values,setValues]=useState<Record<string,string>>({}),[notice,setNotice]=useState<{id:string;text:string}|null>(null);
 const screen=guestWorkbenchScreens[screenId];if(!screen)return <p role="alert">Экран не найден.</p>;
 const value=(key:string,initial:string)=>values[key]??initial;
 function submit(){
  for(const field of screen.fields??[]){const v=value(field.key,field.value);if(field.required&&(!v.trim()||field.type==='check'&&v!=='true')){setNotice({id:screenId,text:'Заполните: '+field.label});return;}
   if(field.type==='number'&&(!/^\d+$/.test(v)||Number(v)>99)){setNotice({id:screenId,text:'Укажите целое число от 0 до 99.'});return;}}
  if(screenId==='SG-CR-001'&&value('carFrom','2030-10-11')>=value('carTo','2030-10-13')){setNotice({id:screenId,text:'Возврат должен быть позже начала аренды.'});return;}
  if(screen.next)onNavigate(screen.next);else setNotice({id:screenId,text:'Демо-проверка выполнена. Ничего не отправлено и не оплачено; документ не выпущен.'});
 }
 return <section><h3>{screen.title}</h3><p>Синтетический пример. Не вводите реальные документы или платёжные данные.</p>{screen.note&&<p>{screen.note}</p>}
  {screen.cards?.map(card=><article key={card.title}><h4>{card.title}</h4><p>{card.detail}</p><button onClick={()=>onNavigate(card.target)}>Посмотреть: {card.title}</button></article>)}
  <form onSubmit={e=>{e.preventDefault();submit();}}>{screen.fields?.map(field=><label key={field.key}>{field.label}
   {field.type==='select'?<select value={value(field.key,field.value)} onChange={e=>setValues({...values,[field.key]:e.target.value})}>{field.options?.map(option=><option key={option}>{option}</option>)}</select>
    :field.type==='check'?<input type="checkbox" checked={value(field.key,field.value)==='true'} required={field.required} onChange={e=>setValues({...values,[field.key]:String(e.target.checked)})}/>
    :<input type={field.type==='readonly'?'text':field.type??'text'} readOnly={field.type==='readonly'} required={field.required} maxLength={300} min={field.type==='number'?0:undefined} max={field.type==='number'?99:undefined} value={value(field.key,field.value)} onChange={e=>setValues({...values,[field.key]:e.target.value})}/>}
  </label>)}<button disabled={screen.special==='partner'}>{screen.action==='Скачать демо-сводку'?'Показать демо-итог':screen.action}</button></form>
  {notice?.id===screenId&&<p role="status">{notice.text}</p>}
 </section>;
}
