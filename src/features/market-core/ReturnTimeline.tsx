import type {Locale} from '../../i18n/messages';
import type {MarketReturn} from './model';
import {marketText} from './locale';
function Timestamp({value,locale}:{value?:string|null;locale:Locale}){
 const date=value?new Date(value):null;
 if(!date||!Number.isFinite(date.getTime()))return <span>{marketText(locale,'timeUnknown')}</span>;
 // Explicit UTC is stable across devices; never imply an unprovided property timezone.
 return <time dateTime={date.toISOString()}>{new Intl.DateTimeFormat(locale,{timeZone:'UTC',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'}).format(date)}</time>;
}
export function ReturnTimeline({value,locale}:{value:MarketReturn;locale:Locale}){
 return <dl data-testid="return-timeline">
  <dt>{marketText(locale,'receivedAt')}</dt><dd><Timestamp value={value.receivedAt} locale={locale}/></dd>
  {value.status!=='quarantined'&&<><dt>{marketText(locale,'resolvedAt')}</dt><dd><Timestamp value={value.resolvedAt} locale={locale}/></dd></>}
 </dl>;
}
