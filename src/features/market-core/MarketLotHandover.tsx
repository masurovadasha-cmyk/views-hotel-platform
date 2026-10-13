import {useState} from 'react';
import type {Locale} from '../../i18n/messages';
import {localizedName} from '../local-core/staff-locale';
import type {MarketOrder} from './model';
import {marketText} from './locale';
export function MarketLotHandover({order,locale,onAction}:{order:MarketOrder;locale:Locale;onAction:(action:string,fields?:Record<string,unknown>)=>void}){
 const t=(k:string)=>marketText(locale,k),[tracked,setTracked]=useState(false),[physical,setPhysical]=useState(false),[enabled,setEnabled]=useState(false),[chosen,setChosen]=useState<Record<string,string>>({});
 const options=tracked?order.trackedLots??[]:order.countedLots??[],complete=order.lines.length>0&&order.lines.every(line=>{const selected=options[Number(chosen[line.serviceId])];return chosen[line.serviceId]!==undefined&&chosen[line.serviceId]!==''&&selected?.serviceId===line.serviceId&&BigInt(selected.quantity)>=BigInt(line.quantity);});
 function confirm(){if(!physical||enabled&&!complete)return;onAction('handover',enabled?{lotSelections:order.lines.map(line=>{const selected=options[Number(chosen[line.serviceId])];return {serviceId:line.serviceId,lotAllocation:{snapshotId:selected.snapshotId,...('movementId' in selected?{movementId:selected.movementId}:{}),lotCode:selected.lotCode,expiresOn:selected.expiresOn}};})}:{});}
 return <section data-testid="market-lot-handover"><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/>{t('useCountedLots')}</label><label><input type="checkbox" checked={tracked} disabled={!enabled} onChange={e=>{setTracked(e.target.checked);setChosen({});}}/>{t('useTrackedLots')}</label><p>{t(tracked?'trackedLotsTerms':'countedLotsTerms')}</p>
 {enabled&&order.lines.map(line=><label key={line.serviceId}>{localizedName(line.name,locale)}<select data-testid="market-counted-lot" value={chosen[line.serviceId]??''} onChange={e=>setChosen({...chosen,[line.serviceId]:e.target.value})}><option value="">{t('chooseCountedLot')}</option>{options.map((lot,i)=>lot.serviceId===line.serviceId&&BigInt(lot.quantity)>=BigInt(line.quantity)?<option key={i} value={i}>{lot.lotCode??t('unknownLot')} · {lot.expiresOn??'—'} · {lot.quantity}</option>:null)}</select></label>)}
 <label><input type="checkbox" checked={physical} onChange={e=>setPhysical(e.target.checked)}/>{t('physical')}</label><button disabled={!physical||enabled&&!complete} onClick={confirm}>{t('handover')}</button></section>;
}
