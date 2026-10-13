import type {Locale} from '../../i18n/messages';
import type {MarketOrder} from './model';
import {marketText} from './locale';
export function MarketReopenHistory({order,locale}:{order:MarketOrder;locale:Locale}){
 if(!order.reopenHistory?.length)return null;
 return <section data-testid="market-reopen-history"><h5>{marketText(locale,'reopenHistory')} · {order.reopenCount}</h5><p>{marketText(locale,'reopenHistoryScope')}</p>
 <ol>{order.reopenHistory.map((entry,index)=><li key={index}><time dateTime={entry.at}>{new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(entry.at))} UTC</time><p>{entry.note}</p></li>)}</ol>
 </section>;
}
