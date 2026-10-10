import {useState} from 'react';
import {supplyQuantity,type StockItem,type SupplyCommand,type SupplyItem,type SupplyUnit} from './supply-api';
import {supplyError,useSupplyLocale} from './SupplyWorkspaceLocale';
type Props={propertyId:string;disabled:boolean;submit:(command:SupplyCommand)=>void};
export function SupplyItemForm({propertyId,disabled,submit}:Props){
 const {t}=useSupplyLocale();const [sku,setSku]=useState(''),[name,setName]=useState(''),[unit,setUnit]=useState<SupplyUnit>('piece');
 return <form data-testid="supply-item-form" onSubmit={e=>{e.preventDefault();submit({kind:'item',key:crypto.randomUUID(),body:{propertyId,sku:sku.trim(),name:name.trim(),unit}});}}><fieldset disabled={disabled}>
  <legend>{t('New catalogue item')}</legend><label>{t('SKU')}<input required pattern="[A-Z0-9_-]{1,40}" maxLength={40} autoCapitalize="characters" value={sku} onChange={e=>setSku(e.target.value.toUpperCase())}/></label>
  <label>{t('Item name')}<input required maxLength={120} value={name} onChange={e=>setName(e.target.value)}/></label><label>{t('Stock unit')}<select value={unit} onChange={e=>setUnit(e.target.value as SupplyUnit)}>{(['piece','gram','millilitre'] as const).map(value=><option key={value} value={value}>{t(value)}</option>)}</select></label>
  <p>{t('Use whole pieces, grams or millilitres. Kilograms and litres must be converted before entry.')}</p><button type="submit" disabled={!name.trim()}>{t('Create catalogue item')}</button>
 </fieldset></form>;
}
export function SupplyOrderForm({propertyId,items,disabled,submit}:{items:SupplyItem[]}&Props){
 const {t}=useSupplyLocale();const [reference,setReference]=useState(''),[lines,setLines]=useState([{itemId:'',quantity:''}]),[error,setError]=useState('');
 function save(){try{const checked=lines.map(line=>({itemId:line.itemId,quantity:supplyQuantity(line.quantity)}));if(checked.some(line=>!items.some(item=>item.id===line.itemId))||new Set(checked.map(line=>line.itemId)).size!==checked.length)throw Error('SUPPLY_INPUT_INVALID');setError('');submit({kind:'order',key:crypto.randomUUID(),body:{propertyId,reference:reference.trim(),lines:checked}});}catch(e){setError(supplyError(e));}}
 return <form data-testid="supply-order-form" onSubmit={e=>{e.preventDefault();save();}}><fieldset disabled={disabled}>
  <legend>{t('Create purchase order')}</legend>{error&&<p className="localError" role="alert">{t(error)}</p>}<label>{t('Order reference')}<input required maxLength={160} value={reference} onChange={e=>setReference(e.target.value)}/></label>
  {lines.map((line,index)=><div className="supplyOrderLine" key={index}><label>{t('Catalogue item')}<select required value={line.itemId} onChange={e=>setLines(old=>old.map((v,i)=>i===index?{...v,itemId:e.target.value}:v))}><option value="">{t('Choose an item')}</option>{items.map(item=><option key={item.id} value={item.id} disabled={lines.some((v,i)=>i!==index&&v.itemId===item.id)}>{item.sku} · {item.name} · {t(item.unit)}</option>)}</select></label>
   <label>{t('Quantity in the selected unit')}<input required inputMode="numeric" pattern="[1-9][0-9]{0,18}" maxLength={19} value={line.quantity} onChange={e=>setLines(old=>old.map((v,i)=>i===index?{...v,quantity:e.target.value}:v))}/></label>
   {lines.length>1&&<button type="button" onClick={()=>setLines(old=>old.filter((_,i)=>i!==index))}>{t('Remove line')}</button>}
  </div>)}
  <button type="button" disabled={lines.length>=20||lines.length>=items.length} onClick={()=>setLines(old=>[...old,{itemId:'',quantity:''}])}>{t('Add line')}</button>
  <p>{t('This records an internal order. It does not send a supplier message or make a payment.')}</p><button type="submit" className="primary" disabled={!items.length||!reference.trim()}>{t('Record purchase order')}</button>
 </fieldset></form>;
}
export function SupplyIssueForm({propertyId,stock,disabled,submit}:{stock:StockItem[]}&Props){
 const {t}=useSupplyLocale();const [itemId,setItemId]=useState(''),[quantity,setQuantity]=useState(''),[reference,setReference]=useState(''),[error,setError]=useState('');
 function save(){try{const amount=supplyQuantity(quantity);if(!stock.some(item=>item.itemId===itemId))throw Error('SUPPLY_INPUT_INVALID');setError('');submit({kind:'issue',key:crypto.randomUUID(),body:{propertyId,itemId,quantity:amount,reference:reference.trim()}});}catch(e){setError(supplyError(e));}}
 return <form data-testid="supply-issue-form" onSubmit={e=>{e.preventDefault();save();}}><fieldset disabled={disabled}>
  <legend>{t('Issue stock')}</legend>{error&&<p className="localError" role="alert">{t(error)}</p>}<label>{t('Stock item on this page')}<select required value={itemId} onChange={e=>setItemId(e.target.value)}><option value="">{t('Choose an item')}</option>{stock.filter(item=>BigInt(item.quantity)>0n).map(item=><option key={item.itemId} value={item.itemId}>{item.sku} · {item.name} · {item.quantity} {t(item.unit)}</option>)}</select></label>
  <label>{t('Quantity in the selected unit')}<input required inputMode="numeric" pattern="[1-9][0-9]{0,18}" maxLength={19} value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
  <label>{t('Issue reference or destination')}<input required maxLength={160} value={reference} onChange={e=>setReference(e.target.value)}/></label><p>{t('Confirm the physical issue. The server checks available stock; a negative balance is forbidden.')}</p>
  <button type="submit" className="primary" disabled={!itemId||!reference.trim()}>{t('Confirm stock issue')}</button>
 </fieldset></form>;
}
