import {useState} from 'react';
import {supplyCount,type SupplyCommand,type SupplyOrder} from './supply-api';
import {supplyError,useSupplyLocale} from './SupplyWorkspaceLocale';
export function SupplyWorkspaceReceipt({order,disabled,submit,onClose}:{order:SupplyOrder;disabled:boolean;submit:(command:SupplyCommand)=>void;onClose:()=>void}){
 const {locale,t}=useSupplyLocale(),remaining=order.lines.filter(line=>BigInt(line.remainingQuantity)>0n);
 const [counts,setCounts]=useState<Record<string,string>>(()=>Object.fromEntries(remaining.map(line=>[line.itemId,line.remainingQuantity]))),[error,setError]=useState('');
 const [lots,setLots]=useState<Record<string,{lotCode:string;expiresOn:string}>>({});
 const count=(value:string)=>new Intl.NumberFormat(locale==='ru'?'ru-RU':locale==='uz'?'uz-Latn-UZ':'en-GB').format(BigInt(value));
 function confirm(){
  try{const lines=remaining.map(line=>{const quantity=supplyCount(counts[line.itemId]||'0');if(BigInt(quantity)>BigInt(line.remainingQuantity))throw Error('RECEIPT_QUANTITY_EXCEEDED');const lot=lots[line.itemId];if(quantity!=='0'&&lot&&(lot.lotCode||lot.expiresOn)&&(!lot.lotCode.trim()||!lot.expiresOn))throw Error('SUPPLY_INPUT_INVALID');return {itemId:line.itemId,quantity,...(quantity!=='0'&&lot?.lotCode.trim()?{lotCode:lot.lotCode.trim(),expiresOn:lot.expiresOn}:{})};}).filter(line=>line.quantity!=='0');
   if(!lines.length)throw Error('SUPPLY_INPUT_INVALID');setError('');submit({kind:'receive',key:crypto.randomUUID(),orderId:order.id,body:{lines}});
  }catch(e){setError(supplyError(e));}
 }
 return <section className="localPanel" data-testid="supply-receipt-preview"><h2>{t('Review received quantities')} · {order.reference}</h2>
  <p>{t('One lot per item per receipt. Enter lot code and expiry together. Lot-based issuing and expiry blocking are not connected yet.')}</p>
  <p>{t('Enter only quantities physically received now. Use zero to skip an item; the outstanding quantities remain open.')}</p>{error&&<p className="localError" role="alert">{t(error)}</p>}
  <form onSubmit={e=>{e.preventDefault();confirm();}}><fieldset disabled={disabled}>
   {remaining.map(line=><div className="supplyReceiptLine" key={line.itemId}><strong>{line.sku} · {line.name} · {t(line.unit)}</strong><dl><dt>{t('Ordered quantity')}</dt><dd>{count(line.quantity)}</dd><dt>{t('Already received')}</dt><dd>{count(line.receivedQuantity)}</dd><dt>{t('Outstanding quantity')}</dt><dd>{count(line.remainingQuantity)}</dd></dl>
    <label>{t('Quantity received now')}<input data-testid="supply-receipt-quantity" data-item-id={line.itemId} required inputMode="numeric" maxLength={19} pattern="0|[1-9][0-9]{0,18}" value={counts[line.itemId]??''} onChange={e=>{setCounts(old=>({...old,[line.itemId]:e.target.value}));setError('');}}/></label>
    <label>{t('Lot code (optional)')}<input data-testid="supply-lot-code" maxLength={80} value={lots[line.itemId]?.lotCode??''} onChange={e=>setLots(old=>({...old,[line.itemId]:{lotCode:e.target.value,expiresOn:old[line.itemId]?.expiresOn??''}}))}/></label>
    <label>{t('Expiry date')}<input data-testid="supply-lot-expiry" type="date" min="0001-01-01" max="9999-12-31" value={lots[line.itemId]?.expiresOn??''} onChange={e=>setLots(old=>({...old,[line.itemId]:{lotCode:old[line.itemId]?.lotCode??'',expiresOn:e.target.value}}))}/></label>
   </div>)}
   <button className="primary" data-testid="supply-receive-confirm" type="submit" disabled={!remaining.length}>{t('Confirm goods received')}</button>
   <button type="button" onClick={onClose}>{t('Close receipt preview')}</button>
  </fieldset></form>
 </section>;
}
