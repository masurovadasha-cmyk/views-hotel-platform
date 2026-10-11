import type {Locale} from '../../i18n/messages';
import {formatStaffMoney,localizedName,localeTags} from '../local-core/staff-locale';
import {laundryText} from './locale';
import type {LaundryIntake} from './model';
export function laundryMoney(value:string,currency:string,locale:Locale){return formatStaffMoney(value,locale).replace(/UZS$/,currency);}
export function LaundrySummary({intake:o,locale}:{intake:LaundryIntake;locale:Locale}){
 const t=(k:string)=>laundryText(locale,k),when=(v:string)=>new Date(v).toLocaleString(localeTags[locale]);
 return <><h4>{localizedName(o.name,locale)}</h4><p data-testid="laundry-stage">{t(o.stage)}</p>
 {o.unitCode&&<p>{t('unit')}: {o.unitCode}</p>}
 <p>{t('count')}: {o.declaredCount} · {t('estimate')}: {laundryMoney(o.estimateMinor,o.currency,locale)}</p>
 <p>{t('pickup')}: {when(o.pickupAt)}</p>{o.preferences&&<p>{o.preferences}</p>}
 {o.items&&<><h5>{t('inventory')}</h5><ul>{o.items.map(i=><li key={i.tag}>{i.tag} · {i.description} · {laundryMoney(i.priceMinor,o.currency,locale)}</li>)}</ul></>}
 {o.totalMinor&&<p>{t('amount')}: <strong>{laundryMoney(o.totalMinor,o.currency,locale)}</strong></p>}
 {o.returnBy&&<p>{t('returnBy')}: {when(o.returnBy)}</p>}</>;
}
