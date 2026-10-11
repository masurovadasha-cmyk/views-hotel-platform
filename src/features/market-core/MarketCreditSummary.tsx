import type {Locale} from '../../i18n/messages';
import type {MarketOrder} from './model';
import {marketMoney} from './format';
import {marketText} from './locale';
export function MarketCreditSummary({order:o,locale}:{order:MarketOrder;locale:Locale}){
 const t=(k:string)=>marketText(locale,k);
 if(!o.creditedMinor||o.creditedMinor==='0')return null;
 return <section data-testid="market-credit-summary"><h5>{t('credited')}: {marketMoney(o.creditedMinor,o.currency,locale)}</h5>
 <p>{t('netCharge')}: {marketMoney((BigInt(o.totalMinor)-BigInt(o.creditedMinor)).toString(),o.currency,locale)}</p><p>{t('creditOnly')}</p>
 <p>{t('recentCredits')}</p><ul>{o.credits?.map(c=><li key={c.id}>{c.reason} · −{marketMoney(c.amountMinor,o.currency,locale)}</li>)}</ul></section>;
}
