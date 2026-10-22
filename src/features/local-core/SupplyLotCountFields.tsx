import type {LotCount} from './supply-api';
import {useSupplyLocale} from './SupplyWorkspaceLocale';
export function SupplyLotCountFields({lots,onChange}:{lots:LotCount[];onChange:(lots:LotCount[])=>void}){
 const {t}=useSupplyLocale();const update=(i:number,change:Partial<LotCount>)=>onChange(lots.map((l,j)=>i===j?{...l,...change}:l));
 return <div data-testid="supply-lot-count-fields"><p>{t('Count every lot, including unknown origin. The sum must match recorded stock. This is a snapshot, not live lot stock.')}</p>
 {lots.map((lot,i)=><fieldset key={i}><legend>{t('Lot')} {i+1}</legend>
 <label>{t('Unknown lot')}<input type="checkbox" checked={lot.lotCode===null} onChange={e=>update(i,e.target.checked?{lotCode:null,expiresOn:null}:{lotCode:'',expiresOn:''})}/></label>
 {lot.lotCode!==null&&<><label>{t('Lot code (optional)')}<input required maxLength={80} value={lot.lotCode} onChange={e=>update(i,{lotCode:e.target.value})}/></label><label>{t('Expiry date')}<input required type="date" min="0001-01-01" max="9999-12-31" value={lot.expiresOn||''} onChange={e=>update(i,{expiresOn:e.target.value})}/></label></>}
 <label>{t('Physical quantity counted')}<input required inputMode="numeric" pattern="0|[1-9][0-9]{0,18}" value={lot.quantity} onChange={e=>update(i,{quantity:e.target.value})}/></label>
 <button type="button" disabled={lots.length===1} onClick={()=>onChange(lots.filter((_,j)=>j!==i))}>{t('Remove lot')}</button></fieldset>)}
 <button type="button" disabled={lots.length===20} onClick={()=>onChange([...lots,{lotCode:'',expiresOn:'',quantity:'0'}])}>{t('Add lot')}</button></div>;
}
