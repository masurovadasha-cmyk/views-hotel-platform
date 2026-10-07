import {useEffect,useState} from 'react';
import {request} from './LocalCoreWorkspace';
export function SyntheticDocumentPreview({reservationId,documentId,csrf,onClose}:{reservationId:string;documentId:string;csrf:string;onClose:()=>void}){
 const [text,setText]=useState(''),[error,setError]=useState('');
 useEffect(()=>{
  let active=true;
  const hide=()=>{if(document.visibilityState==='hidden')onClose();};
  const timer=window.setTimeout(onClose,60000);document.addEventListener('visibilitychange',hide);
  void request<{text:string;syntheticData:boolean}>('document-view',csrf,{reservationId,documentId},crypto.randomUUID()).then(result=>{
   if(result.syntheticData!==true||typeof result.text!=='string'||result.text.length>512)throw Error('INVALID_PREVIEW');
   if(active)setText(result.text);
  }).catch(()=>{if(active)setError('Просмотр недоступен. Проверьте сессию и доступ к брони.');});
  return()=>{active=false;clearTimeout(timer);document.removeEventListener('visibilitychange',hide);};
 },[reservationId,documentId,csrf]);
 return <section aria-label="Просмотр тестового файла" className="localPanel">
  <h3>Искусственный тестовый файл</h3>
  <p>Не удостоверяет личность. Просмотр закроется через минуту или при скрытии вкладки.</p>
  {error?<p role="alert">{error}</p>:text?<pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{text}</pre>:<p role="status">Загрузка файла…</p>}
  <button type="button" onClick={onClose}>Закрыть просмотр</button>
 </section>;
}
