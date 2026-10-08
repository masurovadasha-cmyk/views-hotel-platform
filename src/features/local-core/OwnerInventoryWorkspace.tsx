import {InventoryDraftEditor} from './InventoryDraftEditor';
import {useEffect,useRef,useState} from 'react';
import {request} from './LocalCoreWorkspace';
import {useStaffLocale} from './StaffLocale';
import {formatStaffMoney,localizedName} from './staff-locale';

type Draft={name:string;city:string;address:string;unitTypeName:string;maxGuests:number;unitCodes:string[];nightlyMinor:string;freeCancellationHours:number};
type Fund={properties:Array<{id:string;name:Record<string,string>;city:string;status:string;unitCount:number}>;truncated:boolean;draftOnly:true};
const empty={name:'',city:'',address:'',unitTypeName:'',maxGuests:'2',codes:'',price:'',hours:'48'};
export function OwnerInventoryWorkspace({staffCsrf}:{staffCsrf:string}){
 const {t,locale}=useStaffLocale();const [form,setForm]=useState(empty),[fund,setFund]=useState<Fund|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [attempt,setAttempt]=useState<{key:string;body:Draft}|null>(null),[uncertain,setUncertain]=useState(false);
 const [editing,setEditing]=useState<string|null>(null);
 const submitting=useRef(false);
 const refresh=()=>request<Fund>('owner-inventory',staffCsrf).then(setFund);
 useEffect(()=>{let alive=true;request<Fund>('owner-inventory',staffCsrf).then(value=>{if(alive)setFund(value);}).catch(()=>{if(alive)setError('Кабинет владельца недоступен. Проверьте доступ и повторите загрузку.');});return()=>{alive=false;};},[staffCsrf]);
 const change=(key:keyof typeof empty,value:string)=>{setForm(old=>({...old,[key]:value}));setAttempt(null);setNotice('');setError('');};
 async function save(event:React.FormEvent){
  event.preventDefault();if(submitting.current)return;
  let current=attempt;
  if(!current){
   if(!/^\d{1,13}([.,]\d{1,2})?$/.test(form.price)){setError('Введите цену в сумах, не более двух знаков после запятой.');return;}
   const [whole,fraction='']=form.price.replace(',','.').split('.');
   const body:Draft={name:form.name.trim(),city:form.city.trim(),address:form.address.trim(),unitTypeName:form.unitTypeName.trim(),maxGuests:Number(form.maxGuests),unitCodes:form.codes.split(/[\s,;]+/).filter(Boolean),nightlyMinor:(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))).toString(),freeCancellationHours:Number(form.hours)};
   if(!body.unitCodes.length||body.unitCodes.length>100||new Set(body.unitCodes).size!==body.unitCodes.length||body.unitCodes.some(c=>! /^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(c))){setError('Укажите от 1 до 100 разных кодов номеров: A–Z, цифры, дефис или подчёркивание.');return;}
   current={key:crypto.randomUUID(),body};setAttempt(current);
  }
  submitting.current=true;setBusy(true);setError('');setNotice('');
  try{
   const saved=await request<{propertyId:string;status:string}>('owner-inventory',staffCsrf,current.body,current.key);
   if(saved.status!=='draft'||!saved.propertyId)throw Error('INVALID_RESPONSE');
   setUncertain(false);setAttempt(null);setForm(empty);setNotice('Черновик сохранён. Продажи не открыты.');
   try{await refresh();}catch{setError('Черновик сохранён, но список не обновился. Повторите загрузку.');}
  }catch(e){
   const code=e instanceof Error?e.message:'';
   if(['INVALID_INVENTORY_DRAFT','OWNER_INVENTORY_FORBIDDEN','OWNER_INVENTORY_DISABLED','STAFF_PERMISSION_DENIED','CSRF_REQUIRED'].includes(code)){
    setUncertain(false);setAttempt(null);setError(code==='INVALID_INVENTORY_DRAFT'?'Проверьте данные объекта и номеров.':'Создание недоступно для этой сессии. Данные формы сохранены.');
   }else{setUncertain(true);setError('Ответ не получен. Повторите ту же отправку: дубликат не будет создан. До подтверждения не меняйте данные.');}
  }finally{submitting.current=false;setBusy(false);}
 }
 return <main className="localWorkspace ownerInventory">
  <span className="localEyebrow">{t('VIEWS · КАБИНЕТ ВЛАДЕЛЬЦА')}</span><h1>{t('Объекты и номерной фонд')}</h1>
  <p className="localWarning">{t('Подготовка объекта в Узбекистане. Черновики не доступны для бронирования; открытие продаж требует отдельной проверки.')}</p>
  {error&&<p role="alert" className="localError">{t(error)}</p>}{notice&&<p role="status" className="localSuccess">{t(notice)}</p>}
  {!editing&&<section className="localPanel"><h2>{t('Мои объекты')}</h2><button disabled={busy} onClick={()=>{setError('');void refresh().catch(()=>setError('Кабинет владельца недоступен. Проверьте доступ и повторите загрузку.'));}}>{t('Обновить список')}</button>
   {fund&&fund.properties.length===0&&<p>{t('Объектов пока нет.')}</p>}
   {fund?.truncated&&<p role="status">{t('Показаны последние 100 объектов. Список неполный.')}</p>}
   <ul>{fund?.properties.map(p=><li key={p.id}><strong>{localizedName(p.name,locale)}</strong> · {p.city} · {t('Номеров: {count}',{count:p.unitCount})} · {t(p.status==='draft'?'Черновик':'Существующий объект')}{p.status==='draft'&&<button disabled={busy||uncertain} onClick={()=>setEditing(p.id)}>{t('Редактировать фонд')}</button>}</li>)}</ul>
  </section>}
  {editing?<InventoryDraftEditor key={editing} propertyId={editing} staffCsrf={staffCsrf} onClose={()=>setEditing(null)} onSaved={()=>{void refresh().catch(()=>setError('Черновик сохранён, но список не обновился. Повторите загрузку.'));}}/>:<section className="localPanel"><h2>{t('Новый объект')}</h2><form onSubmit={save}>
   <fieldset disabled={busy||uncertain}>
    {([['name','Название объекта',120],['city','Город',100],['address','Адрес объекта',300],['unitTypeName','Название категории номеров',100]] as const).map(([key,label,max])=><label key={key}>{t(label)}<input required maxLength={max} value={form[key]} onChange={e=>change(key,e.target.value)}/></label>)}
    <label>{t('Гостей в одном номере')}<input type="number" required min={1} max={20} step={1} value={form.maxGuests} onChange={e=>change('maxGuests',e.target.value)}/></label>
    <label>{t('Коды номеров через пробел или запятую')}<textarea required maxLength={2100} placeholder="101, 102, A1" value={form.codes} onChange={e=>change('codes',e.target.value)}/></label>
    <label>{t('Цена за ночь, UZS')}<input required inputMode="decimal" maxLength={16} value={form.price} onChange={e=>change('price',e.target.value)}/></label>
    <label>{t('Бесплатная отмена не позднее, часов до заезда')}<input type="number" required min={1} max={720} step={1} value={form.hours} onChange={e=>change('hours',e.target.value)}/></label>
    <p className="localHint">{t('После указанного срока возврат стоимости проживания — 0%. Налоги и дополнительные сборы здесь не настраиваются.')}</p>
   </fieldset>
   {attempt&&<p>{t('Цена отправки: {price}',{price:formatStaffMoney(attempt.body.nightlyMinor,locale)})}</p>}
   <button className="primary" disabled={busy||!fund}>{t(busy?'Сохранение…':uncertain?'Повторить ту же отправку':'Сохранить черновик объекта')}</button>
  </form></section>}
 </main>;
}
