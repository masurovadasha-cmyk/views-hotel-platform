import {useEffect,useRef,useState} from 'react';
import {request} from './LocalCoreWorkspace';
import {useStaffLocale} from './StaffLocale';
type Category={id:string|null;name:string;maxGuests:number;units:{id:string|null;code:string}[];nightlyMinor:string;freeCancellationHours:number};
type Draft={revision:string;name:string;city:string;address:string;categories:Category[]};
type FormCategory=Omit<Category,'maxGuests'|'nightlyMinor'|'freeCancellationHours'|'units'>&{key:string;maxGuests:string;price:string;hours:string;units:{id:string|null;code:string;key:string}[]};
type Form=Omit<Draft,'categories'>&{categories:FormCategory[]};
const newRoom=()=>({id:null,code:'',key:crypto.randomUUID()});
const newCategory=():FormCategory=>({id:null,key:crypto.randomUUID(),name:'',maxGuests:'2',price:'',hours:'48',units:[newRoom()]});
const toForm=(draft:Draft):Form=>({...draft,categories:draft.categories.map(c=>({...c,key:c.id!,maxGuests:String(c.maxGuests),price:(BigInt(c.nightlyMinor)/100n).toString()+'.'+(BigInt(c.nightlyMinor)%100n).toString().padStart(2,'0'),hours:String(c.freeCancellationHours),units:c.units.map(u=>({...u,key:u.id!}))}))});
export function InventoryDraftEditor({propertyId,staffCsrf,onClose,onSaved}:{propertyId:string;staffCsrf:string;onClose:()=>void;onSaved:()=>void}){
 const {t}=useStaffLocale(),[form,setForm]=useState<Form|null>(null),[busy,setBusy]=useState(true),[dirty,setDirty]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[uncertain,setUncertain]=useState(false),[conflict,setConflict]=useState(false);
 const [attempt,setAttempt]=useState<{body:Draft;key:string}|null>(null),submitting=useRef(false);
 const path='owner-inventory/'+propertyId;
 useEffect(()=>{let alive=true;request<Draft>(path,staffCsrf).then(d=>{if(alive)setForm(toForm(d));}).catch(()=>{if(alive)setError('Этот объект недоступен для редактирования черновика.');}).finally(()=>{if(alive)setBusy(false);});return()=>{alive=false;};},[path,staffCsrf]);
 const load=async()=>{const d=await request<Draft>(path,staffCsrf);setForm(toForm(d));setAttempt(null);setDirty(false);setConflict(false);};
 const change=(fn:(f:Form)=>Form)=>{setForm(f=>f?fn(f):f);setAttempt(null);setDirty(true);setNotice('');setError('');};
 const category=(index:number,fn:(c:FormCategory)=>FormCategory)=>change(f=>({...f,categories:f.categories.map((c,i)=>i===index?fn(c):c)}));
 const discard=()=>!dirty||window.confirm(t('Отменить несохранённые изменения?'));
 async function reload(){if(!discard())return;setBusy(true);setError('');try{await load();}catch{setError('Не удалось загрузить черновик. Повторите загрузку.');}finally{setBusy(false);}}
 async function save(e:React.FormEvent){
  e.preventDefault();if(submitting.current||!form||conflict)return;
  let current=attempt;
  if(!current){
   const codes=form.categories.flatMap(c=>c.units.map(u=>u.code.trim()));
   if(codes.length>100||new Set(codes).size!==codes.length||codes.some(c=>! /^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(c))){setError('Коды номеров должны быть разными во всём объекте. Допустимы A–Z, цифры, дефис и подчёркивание; не более 100 номеров.');return;}
   if(form.categories.some(c=>! /^\d{1,13}([.,]\d{1,2})?$/.test(c.price))){setError('Введите цену в сумах, не более двух знаков после запятой.');return;}
   const body:Draft={revision:form.revision,name:form.name.trim(),city:form.city.trim(),address:form.address.trim(),categories:form.categories.map(c=>{
    const [whole,fraction='']=c.price.replace(',','.').split('.');return {id:c.id,name:c.name.trim(),maxGuests:Number(c.maxGuests),nightlyMinor:(BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'))).toString(),freeCancellationHours:Number(c.hours),units:c.units.map(u=>({id:u.id,code:u.code.trim()}))};
   })};current={body,key:crypto.randomUUID()};setAttempt(current);
  }
  submitting.current=true;setBusy(true);setError('');setNotice('');
  try{
   const result=await request<{propertyId:string;status:string}>(path,staffCsrf,current.body,current.key);
   if(result.propertyId!==propertyId||result.status!=='draft')throw Error('INVALID_RESPONSE');
   setUncertain(false);setAttempt(null);setDirty(false);setNotice('Изменения сохранены. Продажи не открыты.');
   try{await load();}catch{setForm(null);setError('Изменения сохранены, но черновик не загрузился. Повторите загрузку.');}
   onSaved();
  }catch(e){
   const code=e instanceof Error?e.message:'';
   if(code==='INVENTORY_REVISION_CONFLICT'){
    setConflict(true);setUncertain(false);setAttempt(null);setError('Объект изменён в другой сессии. Ваши данные сохранены в форме. Загрузите свежую версию перед следующей отправкой.');
   }else if(['INVALID_INVENTORY_DRAFT','INVENTORY_NOT_EDITABLE','INVENTORY_NOT_FOUND','OWNER_INVENTORY_FORBIDDEN','OWNER_INVENTORY_DISABLED','STAFF_PERMISSION_DENIED','CSRF_REQUIRED'].includes(code)){
    setUncertain(false);setAttempt(null);setError(code==='INVALID_INVENTORY_DRAFT'?'Проверьте данные объекта и номеров.':'Этот объект недоступен для редактирования черновика.');
   }else{setUncertain(true);setError('Ответ не получен. Повторите ту же отправку: дубликат не будет создан. До подтверждения не меняйте данные.');}
  }finally{submitting.current=false;setBusy(false);}
 }
 const count=form?.categories.reduce((n,c)=>n+c.units.length,0)||0;
 return <section className="localPanel inventoryEditor"><h2>{t('Редактирование номерного фонда')}</h2>
  <p>{t('До 20 категорий и 100 номеров в объекте. Изменения применяются вместе после сохранения. Каждая категория имеет свой тариф и условия отмены.')}</p>
  <button type="button" disabled={busy||uncertain} onClick={()=>{if(discard())onClose();}}>{t('Вернуться к объектам')}</button>{' '}
  <button type="button" disabled={busy||uncertain} onClick={()=>void reload()}>{t('Загрузить свежую версию')}</button>
  {error&&<p role="alert" className="localError">{t(error)}</p>}{notice&&<p role="status" className="localSuccess">{t(notice)}</p>}
  {busy&&!form&&<p role="status">{t('Загрузка…')}</p>}
  {form&&<form onSubmit={save}><fieldset disabled={busy||uncertain||conflict}>
   {([['name','Название объекта',120],['city','Город',100],['address','Адрес объекта',300]] as const).map(([key,label,max])=><label key={key}>{t(label)}<input required maxLength={max} value={form[key]} onChange={e=>change(f=>({...f,[key]:e.target.value}))}/></label>)}
   {form.categories.map((c,i)=><fieldset className="inventoryCategory" key={c.key}><legend>{t('Категория {number}',{number:i+1})}</legend>
    <label>{t('Название категории номеров')}<input required maxLength={100} value={c.name} onChange={e=>category(i,c=>({...c,name:e.target.value}))}/></label>
    <label>{t('Гостей в одном номере')}<input required type="number" min={1} max={20} step={1} value={c.maxGuests} onChange={e=>category(i,c=>({...c,maxGuests:e.target.value}))}/></label>
    <label>{t('Цена за ночь, UZS')}<input required inputMode="decimal" maxLength={16} value={c.price} onChange={e=>category(i,c=>({...c,price:e.target.value}))}/></label>
    <label>{t('Бесплатная отмена не позднее, часов до заезда')}<input required type="number" min={1} max={720} step={1} value={c.hours} onChange={e=>category(i,c=>({...c,hours:e.target.value}))}/></label>
    <p className="localHint">{t('После указанного срока возврат стоимости проживания — 0%. Налоги и дополнительные сборы здесь не настраиваются.')}</p>
    {c.units.map((u,j)=><div className="inventoryUnit" key={u.key}><label>{t('Код номера {number}',{number:j+1})}<input required maxLength={20} value={u.code} onChange={e=>category(i,c=>({...c,units:c.units.map((u,n)=>n===j?{...u,code:e.target.value}:u)}))}/></label>
     <button type="button" disabled={c.units.length===1} aria-label={t('Удалить номер {number}',{number:j+1})} onClick={()=>category(i,c=>({...c,units:c.units.filter((_,n)=>n!==j)}))}>{t('Удалить номер')}</button></div>)}
    <div className="localActions"><button type="button" disabled={count>=100} onClick={()=>category(i,c=>({...c,units:[...c.units,newRoom()]}))}>{t('Добавить номер')}</button>
    <button type="button" disabled={form.categories.length===1} onClick={()=>change(f=>({...f,categories:f.categories.filter((_,n)=>n!==i)}))}>{t('Удалить категорию')}</button></div>
   </fieldset>)}
   <button type="button" disabled={form.categories.length>=20||count>=100} onClick={()=>change(f=>({...f,categories:[...f.categories,newCategory()]}))}>{t('Добавить категорию')}</button>
  </fieldset><p>{t('Всего категорий: {categories}. Номеров: {units}.',{categories:form.categories.length,units:count})}</p>
  <button className="primary" disabled={busy||conflict||(!dirty&&!uncertain)}>{t(busy?'Сохранение…':uncertain?'Повторить ту же отправку':'Сохранить изменения фонда')}</button></form>}
 </section>;
}
