import {useState} from 'react';
import type {HospitalityRole} from '../../domain/types';
import {translate,type Locale} from '../../i18n/messages';
import messages from '../guest/market-translations.json';
import {marketProducts,marketCartLines} from '../guest/market-catalog';
import {demoBalance} from '../guest/demo-market';
import {useDemoMarket} from '../guest/useDemoMarket';
import {demoMarketAccess} from './demo-market-policy';
import '../guest/guest-market.css';

export function DemoMarketQueue({role,locale}:{role:HospitalityRole;locale:Locale}){
 const access=demoMarketAccess(role);
 // Separate child ensures roles without access never mount the storage hook.
 return access==='none'?null:<Queue key={role} role={role} locale={locale}/>;
}
function Queue({role,locale}:{role:HospitalityRole;locale:Locale}){
 const t=(key:string)=>translate(messages,locale,key),{state,blocked,error,act}=useDemoMarket();
 const [review,setReview]=useState<{id:string;action:'complete'|'cancel'}|null>(null);
 const readOnly=demoMarketAccess(role)!=='operate',busy=blocked||!!state.pending||!!state.editingOrderId;
 const target=state.orders.find(o=>o.id===review?.id);
 function confirm(){if(!review||readOnly||busy)return;if(act({type:'staff-confirm',id:review.id,action:review.action}))setReview(null);}
 return <section className="guestMarket" data-testid="demo-market-queue">
  <h2>{t('Demo market queue')}</h2>
  <p className="notice">{t('Local demo only. Each sample starts with 10 units. Orders and stock are simulated in this tab; no payment, delivery or real stock movement occurs.')}</p>
  <p>{t('Demo roles only. This screen does not authenticate staff or grant access to Core.')}</p>
  <p>{t('Demo history survives reload in this tab session. Other tabs and devices are separate.')}</p>
  {readOnly&&<p>{t('Read-only demo role. Order changes are unavailable.')}</p>}
  {(state.pending||state.editingOrderId)&&<p role="status">{t('Return to the guest market to finish or cancel the current review or edit. Staff actions are paused.')}</p>}
  {(blocked||error)&&<p role="alert">{t(error==='stale'?'This demo order has already changed. Return to the queue.':error==='pending'?'Return to the guest market to finish or cancel the current review or edit. Staff actions are paused.':'Demo storage is unavailable or invalid. No change was confirmed. Restore storage access and reload; existing data has not been reset.')}</p>}
  {review&&<section className="marketBasket" data-testid="demo-staff-confirmation" aria-label={t('Confirm demo action')}><h3>{t('Confirm demo action')}</h3><p>{review.id} · {t(review.action==='complete'?'Simulate fulfilment':'Cancel demo order')}</p>
   {target&&marketCartLines(target.lines).map(({product,quantity})=><p key={product.id}>{t(product.name)} × {quantity}</p>)}
   <p>{t('No payment, delivery or real stock movement. This updates the shared demo history only.')}</p>
   <button className="primary" data-testid="demo-staff-confirm" disabled={busy||readOnly||target?.status!=='reserved'} onClick={confirm}>{t('Confirm demo action')}</button>
   <button data-testid="demo-staff-back" onClick={()=>setReview(null)}>{t('Back to queue')}</button></section>}
  {!state.orders.length&&<p>{t('No demo orders yet.')}</p>}
  {state.orders.map(order=><article className="marketBasket" data-demo-staff-order={order.id} key={order.id}>
   <h3>{order.id} · {t(order.status==='reserved'?'Demo reserved':order.status==='completed'?'Demo completed':'Demo cancelled')}</h3>
   {marketCartLines(order.lines).map(({product,quantity})=><p key={product.id}>{t(product.name)} × {quantity}</p>)}
   {order.replacesOrderId&&<p>{t('Replaces demo order')}: {order.replacesOrderId}</p>}{order.replacedByOrderId&&<p>{t('Replaced by demo order')}: {order.replacedByOrderId}</p>}
   <p>{t('Not charged')} · UZS</p>
   {!readOnly&&order.status==='reserved'&&<><button data-testid="demo-staff-complete" disabled={busy||!!review} onClick={()=>setReview({id:order.id,action:'complete'})}>{t('Simulate fulfilment')}</button><button data-testid="demo-staff-cancel" disabled={busy||!!review} onClick={()=>setReview({id:order.id,action:'cancel'})}>{t('Cancel demo order')}</button></>}
  </article>)}
  <details data-testid="demo-staff-accounting"><summary>{t('Demo stock accounting')}</summary>{marketProducts.map(product=>{const b=demoBalance(state,product.id);return <p key={product.id}>{t(product.name)}: {t('Demo available')} <strong data-staff-stock={product.id}>{b.available}</strong> · {t('Demo reserved')} {b.reserved} · {t('Demo consumed')} {b.consumed}</p>;})}</details>
 </section>;
}
