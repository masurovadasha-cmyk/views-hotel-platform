import {useStaffLocale} from './StaffLocale';
import {useEffect,useState,useRef} from 'react';
import {request} from './LocalCoreWorkspace';
export function SyntheticDocumentPreview({reservationId,documentId,csrf,onClose}:{reservationId:string;documentId:string;csrf:string;onClose:()=>void}){
 const {t}=useStaffLocale();
 const [receipt,setReceipt]=useState<string|null>(null),[confirmed,setConfirmed]=useState(false),[saving,setSaving]=useState(false);
 const keys=useRef(new Map<string,string>());
 const [text,setText]=useState(''),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  const hide=()=>{if(document.visibilityState==='hidden')onClose();};
  const timer=window.setTimeout(onClose,60000);document.addEventListener('visibilitychange',hide);
  void request<{text:string;syntheticData:boolean;reviewToken:string|null}>('document-view',csrf,{reservationId,documentId},crypto.randomUUID()).then(result=>{
   if(result.syntheticData!==true||typeof result.text!=='string'||result.text.length>512)throw Error('INVALID_PREVIEW');
   if(active){setText(result.text);setReceipt(result.reviewToken);}
  }).catch(()=>{if(active)setError('Просмотр недоступен. Проверьте сессию и доступ к брони.');});
  return()=>{active=false;clearTimeout(timer);document.removeEventListener('visibilitychange',hide);};
 },[reservationId,documentId,csrf]);
 async function decide(decision:'verified'|'rejected'){
  if(!receipt||!confirmed)return;
  let key=keys.current.get(decision);if(!key){key=crypto.randomUUID();keys.current.set(decision,key);}
  setSaving(true);setError('');
  try{await request('document-review',csrf,{reservationId,documentId,decision,reviewToken:receipt},key);onClose();}
  catch{setError('Результат не подтверждён. Повторите то же решение или закройте просмотр и обновите статус. Просроченный просмотр нужно открыть заново.');}
  finally{setSaving(false);}
 }
 return <section aria-label={t("Просмотр тестового файла")} className="localPanel">
  <h3>{t("Искусственный тестовый файл")}</h3>
  <p>{t("Не удостоверяет личность. Просмотр закроется через минуту или при скрытии вкладки.")}</p>
  {error?<p role="alert">{t(error)}</p>:text?<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</pre>:<p role="status">{t("Загрузка файла…")}</p>}
  {text&&receipt&&<div><label><input type="checkbox" checked={confirmed} disabled={saving} onChange={e=>setConfirmed(e.target.checked)}/>{t("Я просмотрел искусственный тестовый файл")}</label>
   <button type="button" disabled={!confirmed||saving} onClick={()=>void decide('verified')}>{t("Принять тестовый документ")}</button>
   <button type="button" disabled={!confirmed||saving} onClick={()=>void decide('rejected')}>{t("Отклонить тестовый документ")}</button>
  </div>}
  <button type="button" onClick={onClose}>{t("Закрыть просмотр")}</button>
 </section>;
}
