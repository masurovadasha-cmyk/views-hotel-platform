import {useState} from 'react';
import {useGuestLocale} from './GuestLocale';
import {GuestServicePaymentPreview} from './GuestServicePaymentPreview';
import './guest-service-payment.css';
// Explicit design fixtures in UZS, never sent to checkout or Core.
const lines=[['Transfer from TAS',180000],['Groceries on arrival',95000],['Cleaning',120000]] as const;
export function GuestArrivalPackage(){
 const {t,locale}=useGuestLocale(),[open,setOpen]=useState(false),[payment,setPayment]=useState(false);
 const money=(amount:number)=>new Intl.NumberFormat(locale==='uz'?'uz-Latn':locale).format(amount)+' UZS';
 if(!open)return <button type="button" onClick={()=>setOpen(true)}>{t('Preview arrival package')}</button>;
 if(payment)return <GuestServicePaymentPreview onBack={()=>setPayment(false)}/>;
 return <section className="servicePaymentPreview" data-testid="arrival-package-preview" data-canva-screen="SG-GN-003">
  <h3>{t('Arrival package')}</h3>
  <p className="notice">{t('Design example only. These prices are not a quote; services are not ordered.')}</p>
  <dl className="arrivalPackageLines">{lines.map(([label,price])=><div key={label}><dt>{t(label)}</dt><dd>{money(price)}</dd></div>)}
   <div><dt>{t('Total')}</dt><dd>{money(lines.reduce((total,[,price])=>total+price,0))}</dd></div>
  </dl>
  <button className="primary wide" type="button" onClick={()=>setPayment(true)}>{t('Preview payment options')}</button>
  <button type="button" onClick={()=>setOpen(false)}>{t('Close package preview')}</button>
 </section>;
}
