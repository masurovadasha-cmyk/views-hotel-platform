import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {laundryText} from './locale';
import {inventoryValid,majorPrice,priceMinor,type LaundryIntake} from './model';
import {laundryMoney} from './LaundrySummary';
export function LaundryQuoteForm({intake:o,locale,disabled,onQuote}:{intake:LaundryIntake;locale:Locale;disabled:boolean;onQuote:(fields:Record<string,unknown>)=>void}){
 const t=(k:string)=>laundryText(locale,k);
 const [rows,setRows]=useState(()=>o.items?.map(i=>({tag:i.tag,description:i.description,price:majorPrice(i.priceMinor)}))||[{tag:'001',description:'',price:''}]);
 const [returnBy,setReturnBy]=useState('');
 const items=rows.map(i=>({tag:i.tag,description:i.description,priceMinor:priceMinor(i.price)||''})),valid=inventoryValid(items);
 function change(index:number,key:'tag'|'description'|'price',value:string){setRows(rows.map((r,n)=>n===index?{...r,[key]:value}:r));}
 return <form onSubmit={e=>{e.preventDefault();if(valid&&Number.isFinite(Date.parse(returnBy)))onQuote({items,returnBy:new Date(returnBy).toISOString()});}}><fieldset disabled={disabled}><legend>{t('inventory')}</legend>
 {rows.map((r,n)=><div key={n} className="localPanel"><label>{t('tag')}<input required maxLength={24} pattern="[A-Z0-9-]{1,24}" value={r.tag} onChange={e=>change(n,'tag',e.target.value)}/></label><label>{t('description')}<input required maxLength={160} value={r.description} onChange={e=>change(n,'description',e.target.value)}/></label><label>{t('price')} ({o.currency})<input required inputMode="decimal" value={r.price} onChange={e=>change(n,'price',e.target.value)}/></label><button type="button" disabled={rows.length===1} onClick={()=>setRows(rows.filter((_,i)=>i!==n))}>{t('remove')} {n+1}</button></div>)}
 <button type="button" disabled={rows.length>=50} onClick={()=>setRows([...rows,{tag:'',description:'',price:''}])}>{t('add')}</button>
 <p>{valid?`${t('amount')}: ${laundryMoney(items.reduce((s,i)=>s+BigInt(i.priceMinor),0n).toString(),o.currency,locale)}`:t('invalidInventory')}</p>
 <label>{t('returnBy')}<input type="datetime-local" required value={returnBy} onChange={e=>setReturnBy(e.target.value)}/></label>
 <button disabled={!valid}>{t('quote')}</button></fieldset></form>;
}
