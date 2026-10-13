import {useEffect,useRef,useState} from 'react';
import {supplyApi,type SupplyCommand,type SupplyItem,type SupplyOrder,type SupplyPage,type SupplyProperty,type StockItem,type StockMovement} from './supply-api';
import {supplyDefinitive,supplyError,useSupplyLocale} from './SupplyWorkspaceLocale';
import {SupplyIssueForm,SupplyItemForm,SupplyOrderForm} from './SupplyWorkspaceForms';
import {SupplyWorkspaceReceipt} from './SupplyWorkspaceReceipt';
import {SupplyWorkspaceStocktake} from './SupplyWorkspaceStocktake';
import {localeTags,localizedName} from './staff-locale';
import './supply-workspace.css';
type Props={staffCsrf:string;direction:'procurement'|'warehouse';permissions:string[]};
export function SupplyWorkspace({staffCsrf,direction,permissions}:Props){
 const {locale,t}=useSupplyLocale();const [properties,setProperties]=useState<SupplyPage<SupplyProperty>|null>(null),[propertyId,setPropertyId]=useState(''),[items,setItems]=useState<SupplyPage<SupplyItem>|null>(null),[orders,setOrders]=useState<SupplyPage<SupplyOrder>|null>(null),[stock,setStock]=useState<SupplyPage<StockItem>|null>(null),[movements,setMovements]=useState<SupplyPage<StockMovement>|null>(null);
 const [receipt,setReceipt]=useState<SupplyOrder|null>(null),[attempt,setAttempt]=useState<SupplyCommand|null>(null),[revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[online,setOnline]=useState(navigator.onLine);
 const running=useRef(false),generation=useRef(0),property=properties?.items.find(p=>p.id===propertyId),isPurchase=direction==='procurement';
 const canWrite=permissions.includes(isPurchase?'purchase.manage':'stock.manage'),canRead=permissions.includes('supply.read');
 useEffect(()=>{const sync=()=>setOnline(navigator.onLine);window.addEventListener('online',sync);window.addEventListener('offline',sync);return()=>{generation.current++;window.removeEventListener('online',sync);window.removeEventListener('offline',sync);};},[]);
 const clear=()=>{setItems(null);setOrders(null);setStock(null);setMovements(null);setReceipt(null);};
 async function refresh(turn:number){
  if(isPurchase){const [catalog,purchases]=await Promise.all([supplyApi.items(staffCsrf,propertyId),supplyApi.orders(staffCsrf,propertyId)]);if(generation.current===turn){setItems(catalog);setOrders(purchases);}}
  else{const [purchases,balances,history]=await Promise.all([supplyApi.orders(staffCsrf,propertyId),supplyApi.stock(staffCsrf,propertyId),supplyApi.movements(staffCsrf,propertyId)]);if(generation.current===turn){setOrders(purchases);setStock(balances);setMovements(history);}}
 }
 async function load(kind:'properties'|'workspace'|'items'|'orders'|'stock'|'movements',cursor?:string){
  if(running.current||!online||attempt||!canRead)return;running.current=true;setBusy(true);setError('');setNotice('');const turn=generation.current;
  try{
   if(kind==='properties'){const page=await supplyApi.properties(staffCsrf,cursor);if(generation.current===turn)setProperties(old=>({...page,items:cursor?[...(old?.items||[]),...page.items.filter(item=>!old?.items.some(p=>p.id===item.id))]:page.items}));}
   else if(kind==='workspace'){clear();await refresh(turn);}
   else if(kind==='items'){const page=await supplyApi.items(staffCsrf,propertyId,cursor);if(generation.current===turn)setItems(old=>({...page,items:[...(old?.items||[]),...page.items.filter(item=>!old?.items.some(p=>p.id===item.id))]}));}
   else if(kind==='orders'){setReceipt(null);const page=await supplyApi.orders(staffCsrf,propertyId,cursor);if(generation.current===turn)setOrders(page);}
   else if(kind==='stock'){const page=await supplyApi.stock(staffCsrf,propertyId,cursor);if(generation.current===turn){setStock(page);setRevision(v=>v+1);}}
   else{const page=await supplyApi.movements(staffCsrf,propertyId,cursor);if(generation.current===turn)setMovements(page);}
  }catch(e){if(generation.current===turn)setError(supplyError(e));}finally{running.current=false;if(generation.current===turn)setBusy(false);}
 }
 async function execute(command:SupplyCommand){
  if(running.current||!online||!canWrite)return;running.current=true;setBusy(true);setAttempt(command);setError('');setNotice('');const turn=generation.current;
  try{await supplyApi.execute(staffCsrf,command);if(generation.current!==turn)return;setAttempt(null);setReceipt(null);setRevision(v=>v+1);setNotice('The operation was recorded. No payment or supplier message was sent.');clear();
   try{await refresh(turn);}catch{if(generation.current===turn)setError('The operation was saved, but the lists could not be refreshed. Reload the workspace.');}
  }catch(e){if(generation.current!==turn)return;setError(supplyError(e));if(supplyDefinitive(e)){setAttempt(null);clear();}}
  finally{running.current=false;if(generation.current===turn)setBusy(false);}
 }
 const locked=busy||!online||!!attempt;
 const lotStatus={lot_returned:'Returned to the confirmed issued lot',lot_issued:'Selected counted lot issued',receipt_lot_recorded:'Receipt lot recorded',snapshot_recorded:'Lot count snapshot recorded',allocation_pending:'Lot allocation pending',not_tracked:'Movement predates lot tracking'};
 const when=(value:string)=>new Intl.DateTimeFormat(localeTags[locale],{dateStyle:'short',timeStyle:'short',timeZone:property?.timezone||'Asia/Tashkent'}).format(new Date(value));
 const count=(value:string)=>new Intl.NumberFormat(localeTags[locale]).format(BigInt(value));
 if(!canRead)return <main className="localWorkspace"><p>{t('Supply access is not granted to this account.')}</p></main>;
 return <main className="localWorkspace supplyWorkspace" data-testid={'supply-'+direction} aria-busy={busy}>
  <h1>{t(isPurchase?'Procurement workspace':'Warehouse workspace')}</h1><p className="localWarning">{t('Local test workspace. Quantities only: supplier delivery, payments and inventory valuation are not connected.')}</p>
  <details className="localPanel"><summary>V Market</summary><p>{t('V Market stock reservations are available in the local pilot for explicitly published products. Supplier deliveries and external couriers are not connected.')}</p></details>
  {!canWrite&&<p>{t('Read-only access. Changes require separate permission.')}</p>}{!online&&<p role="status">{t('Offline. Reconnect and retry manually. Nothing is sent automatically.')}</p>}
  {error&&<p className="localError" role="alert">{t(error)}</p>}{notice&&<p className="localSuccess" role="status">{t(notice)}</p>}
  {attempt&&<button data-testid="supply-retry" disabled={busy||!online} onClick={()=>void execute(attempt)}>{t('Retry the same operation')}</button>}
  {!properties?<button data-testid="supply-open" disabled={locked} onClick={()=>void load('properties')}>{t('Open supply workspace')}</button>:<>
   <section className="localPanel"><label>{t('Property')}<select data-testid="supply-property" value={propertyId} disabled={locked} onChange={e=>{setPropertyId(e.target.value);clear();setNotice('');setError('');setRevision(v=>v+1);}}><option value="">{t('Choose a property')}</option>{properties.items.map(p=><option key={p.id} value={p.id}>{localizedName(p.name,locale)}</option>)}</select></label>
    {!properties.items.length&&<p>{t('No properties are available to this account.')}</p>}{properties.nextCursor&&<button disabled={locked} onClick={()=>void load('properties',properties.nextCursor!)}>{t('Load more properties')}</button>}
    <button disabled={locked||!propertyId} onClick={()=>void load('workspace')}>{t('Load supply data')}</button>
   </section>
   {isPurchase&&items&&<section className="localPanel"><h2>{t('Item catalogue')}</h2><ul className="supplyRows">{items.items.map(item=><li key={item.id}>{item.sku} · {item.name} · {t(item.unit)}</li>)}</ul>{!items.items.length&&<p>{t('No catalogue items yet.')}</p>}
    {items.nextCursor&&<button disabled={locked} onClick={()=>void load('items',items.nextCursor!)}>{t('Load more catalogue items')}</button>}
    {canWrite&&<><SupplyItemForm key={'item:'+revision} propertyId={propertyId} disabled={locked} submit={command=>void execute(command)}/><SupplyOrderForm key={'order:'+revision} propertyId={propertyId} items={items.items} disabled={locked} submit={command=>void execute(command)}/></>}
   </section>}
   {orders&&<section className="localPanel"><h2>{t(isPurchase?'Purchase orders':'Goods receipt')}</h2>{!orders.items.length&&<p>{t('No orders on this page.')}</p>}
    <ul className="supplyRows">{orders.items.map(order=><li key={order.id} data-testid="supply-order"><strong>{order.reference} · {t(order.status)}</strong><p>{when(order.createdAt)}</p><ul>{order.lines.map(line=><li key={line.itemId}>{line.sku} · {line.name} · {count(line.quantity)} {t(line.unit)} · {t('Already received')}: {count(line.receivedQuantity)} · {t('Outstanding quantity')}: {count(line.remainingQuantity)}</li>)}</ul>
     {!isPurchase&&canWrite&&order.status!=='received'&&<button disabled={locked} onClick={()=>setReceipt(order)}>{t('Review goods receipt')}</button>}</li>)}</ul>
    {orders.nextCursor&&<button disabled={locked} onClick={()=>void load('orders',orders.nextCursor!)}>{t('Next orders')}</button>}
   </section>}
   {!isPurchase&&receipt&&<SupplyWorkspaceReceipt key={receipt.id} order={receipt} disabled={locked||!canWrite} submit={command=>void execute(command)} onClose={()=>setReceipt(null)}/>}
   {!isPurchase&&stock&&<section className="localPanel"><h2>{t('Current stock')}</h2><ul className="supplyRows">{stock.items.map(item=><li key={item.itemId} data-testid="supply-stock">{item.sku} · {item.name} · <strong>{count(item.quantity)} {t(item.unit)}</strong>{item.reservedQuantity!==undefined&&item.availableQuantity!==undefined&&<p>{t('Reserved for V Market')}: {count(item.reservedQuantity)} · {t('Available to issue')}: {count(item.availableQuantity)}</p>}</li>)}</ul>{!stock.items.length&&<p>{t('No stock items on this page.')}</p>}
    {stock.items.filter(item=>item.lotSnapshot).map(item=><section key={'lots:'+item.itemId} data-testid="supply-lot-snapshot"><h3>{item.sku} · {t('Lot count snapshot')}</h3><p>{t(item.lotSnapshot!.current?'Current at last check':'Stale: recount lots')} · {when(item.lotSnapshot!.createdAt)}</p><ul>{item.lotSnapshot!.lots.map((lot,i)=><li key={i}>{lot.lotCode??t('Unknown lot')} · {lot.expiresOn??'—'} · {count(lot.quantity)} {t(item.unit)}</li>)}</ul></section>)}
    {stock.nextCursor&&<button disabled={locked} onClick={()=>void load('stock',stock.nextCursor!)}>{t('Next stock items')}</button>}
    {canWrite&&<><SupplyIssueForm key={'issue:'+revision} propertyId={propertyId} stock={stock.items} disabled={locked} submit={command=>void execute(command)}/><SupplyWorkspaceStocktake key={'stocktake:'+revision} propertyId={propertyId} staffCsrf={staffCsrf} stock={stock.items} disabled={locked} submit={command=>void execute(command)}/></>}
   </section>}
   {!isPurchase&&movements&&<section className="localPanel"><h2>{t('Stock movement history')}</h2><p>{t('Automatic lot allocation is not enabled. Manual counted-lot issues are recorded separately; these are not live lot balances.')}</p><ul className="supplyRows">{movements.items.map(movement=><li key={movement.id} data-testid="supply-movement"><strong>{movement.sku} · {movement.name} · {count(movement.quantity)} {t(movement.unit)}</strong><p>{t(movement.kind)} · {movement.reference} · {when(movement.createdAt)}</p><p data-testid="supply-lot-tracking">{t(lotStatus[movement.lotTrackingStatus??'not_tracked'])}</p>{movement.lotAllocation&&<p data-testid="supply-issued-lot">{movement.lotAllocation.lotCode??t('Unknown lot')} · {movement.lotAllocation.expiresOn??'—'}</p>}{movement.returnLot&&<p data-testid="supply-returned-lot">{movement.returnLot.lotCode??t('Unknown lot')} · {movement.returnLot.expiresOn??'—'} · {t('Source issue')}: {movement.returnLot.sourceIssueId}</p>}{movement.kind==='receipt'&&<p data-testid="supply-lot-details">{movement.lotCode?`${t('Lot')}: ${movement.lotCode} · ${t('Expiry date')}: ${movement.expiresOn}`:t('Lot data not recorded')}</p>}</li>)}</ul>{!movements.items.length&&<p>{t('No stock movements on this page.')}</p>}
    {movements.nextCursor&&<button disabled={locked} onClick={()=>void load('movements',movements.nextCursor!)}>{t('Next movements')}</button>}
   </section>}
  </>}
 </main>;
}
