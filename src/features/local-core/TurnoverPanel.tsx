import {useMemo,useState} from 'react';
export type TurnoverRow={reservationId:string;confirmationCode:string;unitCode:string|null;status:string;version:number;stayPilot?:boolean;checkInAt:string;checkOutAt:string};
type Group={total:number;truncated:boolean;items:TurnoverRow[]};

/** Front-desk confirmation of existing synthetic turnovers; no cleaner role grant. */
export function TurnoverPanel({group,disabled,format,onConfirm}:{group:Group;disabled:boolean;format:(value:string)=>string;onConfirm:(row:TurnoverRow,trigger:HTMLButtonElement)=>void}){
 const [query,setQuery]=useState(''),[sort,setSort]=useState<'checkout'|'unit'>('checkout');
 const rows=useMemo(()=>{
  const needle=query.trim().toLocaleLowerCase('ru-RU');
  return group.items.filter(row=>!needle||[row.unitCode||'',row.confirmationCode].some(value=>value.toLocaleLowerCase('ru-RU').includes(needle)))
   .sort((a,b)=>sort==='unit'?(a.unitCode||'').localeCompare(b.unitCode||'','ru',{numeric:true})||a.reservationId.localeCompare(b.reservationId):Date.parse(a.checkOutAt)-Date.parse(b.checkOutAt)||a.reservationId.localeCompare(b.reservationId));
 },[group.items,query,sort]);
 return <section id="staff-cleaning" tabIndex={-1} className="localPanel turnoverPanel" aria-label="Ожидают уборки (тест)">
  <h3>Готовность номеров после уборки</h3>
  <p>Ожидают подтверждения: <strong>{group.total}</strong></p>
  <p className="localHint">Текущая очередь после тестовых выездов, независимо от даты ресепшена. Подтверждайте готовность только после проверки номера. Назначение исполнителей и отдельный вход уборщика пока не подключены.</p>
  <div className="turnoverFilters">
   <label>Поиск уборки по номеру или брони<input type="search" maxLength={80} value={query} onChange={e=>setQuery(e.target.value)}/></label>
   <label><span id="turnover-sort-label">Порядок очереди уборки</span><select aria-labelledby="turnover-sort-label" value={sort} onChange={e=>setSort(e.target.value as 'checkout'|'unit')}><option value="checkout">По плановой дате выезда</option><option value="unit">По номеру</option></select></label>
   {query&&<button type="button" onClick={()=>setQuery('')}>Сбросить поиск уборки</button>}
  </div>
  {group.truncated&&<p className="localWarning">Загружены первые {group.items.length} из {group.total} записей. Поиск и сортировка действуют только на загруженную часть очереди.</p>}
  <p role="status">Показано: {rows.length} из {group.items.length} загруженных записей.</p>
  {group.total===0?<p>Нет номеров, ожидающих подтверждения уборки.</p>:rows.length===0?<p>Совпадений в загруженной очереди нет. Измените или сбросьте поиск.</p>:
   <ul className="turnoverGrid">{rows.map(row=><li key={row.reservationId} data-stay-id={row.reservationId}>
    <h4>{row.unitCode?'Номер '+row.unitCode:'Номер не назначен'}</h4>
    <p>Бронь: <strong>{row.confirmationCode}</strong></p>
    <p>Плановый выезд: {format(row.checkOutAt)}</p>
    <p>Выезд оформлен · готовность не подтверждена</p>
    <button type="button" disabled={disabled||!row.stayPilot||row.status!=='checked_out'} onClick={event=>onConfirm(row,event.currentTarget)}>Подтвердить уборку (тест)</button>
   </li>)}</ul>}
 </section>;
}
