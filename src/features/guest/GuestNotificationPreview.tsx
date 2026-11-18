import {useState} from 'react';
import {useGuestLocale} from './GuestLocale';
import './guest-service-payment.css';
const examples=[{title:'Cleaning has started',order:'CL-1042',time:'14:00'},{title:'Malika is assigned',order:'CL-1042',time:'13:48'},{title:'Laundry pickup scheduled',order:'LA-1081',time:'16:00'}] as const;
export function GuestNotificationPreview(){
 const {t}=useGuestLocale(),[open,setOpen]=useState(false),[empty,setEmpty]=useState(false),[selected,setSelected]=useState(0),[detail,setDetail]=useState(false);
 if(!open)return <button type="button" onClick={()=>setOpen(true)}>{t('Preview notifications')}</button>;
 const event=examples[selected];
 return <section className="servicePaymentPreview" data-testid="notification-preview" data-canva-screen="SG-GN-012">
  <h3>{t('Notifications')}</h3><p className="notice">{t('Design examples only. These are not updates about your orders.')}</p>
  <button type="button" aria-pressed={empty} onClick={()=>{setEmpty(!empty);setDetail(false);}}>{t('Show empty state')}</button>
  {empty?<p role="status">{t('No notifications yet')}</p>:<>
   <p>{t('Active orders')} · {t('Example task deadline')}: 14:40</p>
   <fieldset><legend>{t('Select a notification')}</legend>{examples.map((item,index)=><label key={index} className="servicePaymentOption">
    <input type="radio" name="notification-preview" checked={selected===index} onChange={()=>{setSelected(index);setDetail(false);}}/>
    <span><strong>{t(item.title)}</strong><small>{item.order} · {item.time}</small></span>
   </label>)}</fieldset>
   <button className="primary wide" type="button" onClick={()=>setDetail(true)}>{t('Preview related order')}</button>
   {detail&&<div className="notice" role="status" data-testid="notification-order-preview"><b>{event.order}</b><p>{t(event.title)} · {event.time}</p><p>{t('This example has no live order. No request has been sent.')}</p></div>}
  </>}
  <button type="button" onClick={()=>{setOpen(false);setDetail(false);}}>{t('Close notifications preview')}</button>
 </section>;
}
