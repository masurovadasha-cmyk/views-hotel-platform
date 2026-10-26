import {useEffect,useState} from 'react';
import {formatStaffMoney} from '../local-core/staff-locale';
import {translate} from './messages';
import type {Locale} from './model';
import {simulatePricing,type PriceRule} from './pricing';
export function PricingDraft({locale,value,onChange}:{locale:Locale;value:PriceRule|null;onChange:(value:PriceRule|null)=>void}){
 const t=(key:string)=>translate(locale,key),[quantity,setQuantity]=useState('1'),[result,setResult]=useState<ReturnType<typeof simulatePricing>|null>(null);
 useEffect(()=>{setResult(null);},[value?.kind,value?.currency,value?.unitMinor]);
 let calculation:ReturnType<typeof simulatePricing>|null=null;
 try{calculation=simulatePricing(value,quantity);}catch{/* Invalid/incomplete input is never a quote. */}
 return <section data-testid="builder-pricing"><h4>{t('Draft price arithmetic')}</h4><p>{t('Simulation only, not an approved price or quote. No taxes, discounts, commissions, payments or publication.')}</p>
 <label>{t('Draft price mode')}<select data-testid="builder-price-mode" value={value?'unit':'none'} onChange={e=>{setResult(null);onChange(e.target.value==='unit'?{kind:'unit',currency:'UZS',unitMinor:''}:null);}}><option value="none">{t('No price configured · UZS')}</option><option value="unit">{t('Unit amount × sample quantity')}</option></select></label>
 {value&&<><label>{t('Unit amount in minor units')}<input data-testid="builder-unit-minor" type="text" inputMode="numeric" maxLength={19} value={value.unitMinor} onChange={e=>{setResult(null);onChange({...value,unitMinor:e.target.value});}}/></label><p>{t('100 minor units = 1 UZS. Sample quantity: 1–50. These are simulation limits, not service availability.')}</p><label>{t('Sample quantity')}<input data-testid="builder-price-quantity" type="text" inputMode="numeric" maxLength={2} value={quantity} onChange={e=>{setQuantity(e.target.value);setResult(null);}}/></label>
 {!calculation&&<p role="status">{t('Enter canonical whole numbers within the simulation limits; the total must fit a signed 64-bit integer.')}</p>}
 <button data-testid="builder-price-calculate" disabled={!calculation} onClick={()=>setResult(calculation)}>{t('Calculate unpublished sample')}</button>
 {result&&<output data-testid="builder-price-result" data-total-minor={result.totalMinor} aria-live="polite">{t('Unapproved simulated total')}: {result.totalMinor} UZS {t('minor units')} · {formatStaffMoney(result.totalMinor,locale)}</output>}</>}
 </section>;
}
