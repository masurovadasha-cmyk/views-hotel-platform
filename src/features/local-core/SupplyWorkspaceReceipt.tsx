import {useState} from 'react';
import {supplyCount,type SupplyCommand,type SupplyOrder} from './supply-api';
import {supplyError,useSupplyLocale} from './SupplyWorkspaceLocale';
export function SupplyWorkspaceReceipt({order,disabled,submit,onClose}:{order:SupplyOrder;disabled:boolean;submit:(command:SupplyCommand)=>void;onClose:()=>void}){
 const {locale,t}=useSupplyLocale(),remaining=order.lines.filter(line=>BigInt(line.remainingQuantity)>0n);
 const [counts,setCounts]=useState<Record<string,string>>(()=>Object.fromEntries(remaining.map(line=>[line.itemId,line.remainingQuantity]))),[error,setError]=useState('');
 const count=(value:string)=>new Intl.NumberFormat(locale==='ru'?'ru-RU':locale==='uz'?'uz-Latn-UZ':'en-GB').format(BigInt(value));
 function confirm(){
  try{const lines=remaining.map(line=>{const quantity=supplyCount(counts[line.itemId]||'0');if(BigInt(quantity)>BigInt(line.remainingQuantity))throw Error('RECEIPT_QUANTITY_EXCEEDED');return {itemId:line.itemId,quantity};}).filter(line=>line.quantity!=='0');
   if(!lines.length)throw Error('SUPPLY_INPUT_INVALID');setError('');submit({kind:'receive',key:crypto.randomUUID(),orderId:order.id,body:{lines}});
  }catch(e){setError(supplyError(e));}
 }
 return <section className="localPanel" data-testid="supply-receipt-preview"><h2>{t('Review received quantities')} · {order.reference}</h2>
  <p>{t('Enter only quantities physically received now. Use zero to skip an item; the outstanding quantities remain open.')}</p>{error&&<p className="localError" role="alert">{t(error)}</p>}
  <form onSubmit={e=>{e.preventDefault();confirm();}}><fieldset disabled={disabled}>
   {remaining.map(line=><div className="supplyReceiptLine" key={line.itemId}><strong>{line.sku} · {line.name} · {t(line.unit)}</strong><dl><dt>{t('Ordered quantity')}</dt><dd>{count(line.quantity)}</dd><dt>{t('Already received')}</dt><dd>{count(line.receivedQuantity)}</dd><dt>{t('Outstanding quantity')}</dt><dd>{count(line.remainingQuantity)}</dd></dl>
    <label>{t('Quantity received now')}<input data-testid="supply-receipt-quantity" data-item-id={line.itemId} required inputMode="numeric" maxLength={19} pattern="0|[1-9][0-9]{0,18}" value={counts[line.itemId]??''} onChange={e=>{setCounts(old=>({...old,[line.itemId]:e.target.value}));setError('');}}/></label>
   </div>)}
   <button className="primary" data-testid="supply-receive-confirm" type="submit" disabled={!remaining.length}>{t('Confirm goods received')}</button>
   <button type="button" onClick={onClose}>{t('Close receipt preview')}</button>
  </fieldset></form>
 </section>;
}
