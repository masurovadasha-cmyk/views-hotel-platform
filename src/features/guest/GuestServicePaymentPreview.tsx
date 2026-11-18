import {useState} from 'react';
import {useGuestLocale} from './GuestLocale';
import './guest-service-payment.css';
const methods=[['folio','Charge to room','Requires eligibility for this booking.'],['card','Bank card','No saved card is connected.'],['payme','Payme','Provider connection required.'],['click','Click','Provider connection required.']] as const;
export function GuestServicePaymentPreview({onBack}:{onBack:()=>void}){
 const {t}=useGuestLocale(),[selected,setSelected]=useState('folio');
 return <section className="servicePaymentPreview" data-testid="service-payment-preview" data-canva-screen="SG-GN-004">
  <h3>{t('How would you like to pay?')}</h3>
  <p className="notice">{t('Payment layout preview. No payment method is connected and no charge will be made.')}</p>
  <fieldset><legend>{t('Payment method preview')}</legend>{methods.map(([id,label,description])=><label className="servicePaymentOption" key={id}>
   <input type="radio" name="service-payment-preview" value={id} checked={selected===id} onChange={()=>setSelected(id)}/>
   <span><strong>{t(label)}</strong><small>{t(description)}</small></span>
  </label>)}</fieldset>
  <p>{t('The final amount and available methods must come from your booking before confirmation.')}</p>
  <button className="primary wide" disabled>{t('Payment unavailable')}</button>
  <button type="button" onClick={onBack}>{t('Back to request')}</button>
 </section>;
}
