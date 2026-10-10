import {useState} from 'react';
import type {ServiceOrder} from '../../domain/types';
import {useLegacyStaffLocale} from './LegacyStaffLocale';
import {filterOrders,orderActions,queueOrders,type OrderAction,type QueueSort,type QueueView} from './staff-queue';
export type OrderHandler = (id:string,action:OrderAction)=>void|Promise<void>;

export function OrderActions({order,act}:{order:ServiceOrder;act:OrderHandler}) {
  const {t}=useLegacyStaffLocale();
  const [busy,setBusy]=useState(false);
  const labels={accept:'Accept',start:'Start',complete:'Complete'};
  async function run(action:OrderAction) {setBusy(true);try {await act(order.id,action);} finally {setBusy(false);}}
  return <div className="orderActions" aria-busy={busy}>{orderActions(order.status).map(action=><button key={action} disabled={busy} className={action==='start'?'primary':''} onClick={()=>void run(action)}>{t(labels[action])}</button>)}</div>;
}

export function Orders({orders,act,onOpen}:{orders:ServiceOrder[];act:OrderHandler;onOpen?:(o:ServiceOrder)=>void}) {
  const {t}=useLegacyStaffLocale();
  return <section className="panel"><header><small>{t('VIEWS CRM')}</small><h2>{t('Service Orders')}</h2></header>{orders.length===0?<div className="emptyLine">{t('No requests in this queue.')}</div>:<div className="orderList">{orders.map(order=><article className="order" key={order.id} data-order-id={order.id}>
    <div className="orderSummary">{onOpen?<button className="orderOpen" onClick={()=>onOpen(order)}>{order.title}</button>:<b>{order.title}</b>}<span>{t('Apt')} {order.unit??'—'} · {t(order.category.replace(/_/g,' '))} · {order.guestName??t('No guest')}</span><small className={'orderPriority '+order.priority}>{t(order.priority)}</small></div>
    <span className={'status '+order.status}>{t(order.status.replace(/_/g,' '))}</span><OrderActions order={order} act={act}/>
  </article>)}</div>}</section>;
}

export function UnifiedInbox({orders,act,onOpen}:{orders:ServiceOrder[];act:OrderHandler;onOpen:(o:ServiceOrder)=>void}) {
  const {t,locale}=useLegacyStaffLocale();
  const [view,setView]=useState<QueueView>('open');
  const [search,setSearch]=useState(''); const [category,setCategory]=useState('');
  const [priority,setPriority]=useState(''); const [sort,setSort]=useState<QueueSort>('priority');
  const result=filterOrders(queueOrders(orders,view),{search,category,priority,sort},locale);
  const views: [QueueView,string][]=[['open','Open Requests'],['progress','In Progress'],['resolved','Resolved']];
  return <div className="unifiedInbox" data-testid="staff-inbox"><div className="inboxTabs" role="group" aria-label={t('Request queues')}>{views.map(([id,label])=><button key={id} aria-pressed={view===id} className={view===id?'active':''} onClick={()=>setView(id)}>{t(label)} <b>{queueOrders(orders,id).length}</b></button>)}</div>
    <div className="staffQueueFilters"><label className="staffQueueSearch">{t('Search requests')}<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('Task, apartment, guest or assignee')} data-testid="staff-inbox-search"/></label>
      <label>{t('Category')}<select value={category} onChange={e=>setCategory(e.target.value)}><option value="">{t('All categories')}</option>{[...new Set(orders.map(o=>o.category))].sort().map(value=><option key={value} value={value}>{t(value.replace(/_/g,' '))}</option>)}</select></label>
      <label>{t('Priority')}<select value={priority} onChange={e=>setPriority(e.target.value)}><option value="">{t('All priorities')}</option>{['urgent','high','normal','low'].map(value=><option key={value} value={value}>{t(value)}</option>)}</select></label>
      <label>{t('Sort by')}<select value={sort} onChange={e=>setSort(e.target.value as QueueSort)}><option value="priority">{t('Priority')}</option><option value="title">{t('Description')}</option><option value="apartment">{t('Apartment')}</option></select></label>
    </div>
    <div className="staffQueueSummary"><p role="status">{t('Showing {count} requests',{count:result.length})}</p>{(search||category||priority)&&<button onClick={()=>{setSearch('');setCategory('');setPriority('');}}>{t('Clear filters')}</button>}</div>
    <Orders orders={result} act={act} onOpen={onOpen}/><p className="staffMuted">{t('Filters apply to loaded requests visible to your role. SLA deadlines are not available here.')}</p>
  </div>;
}
