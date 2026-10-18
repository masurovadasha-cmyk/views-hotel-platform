import type {Locale} from '../../i18n/messages';
import {localizedName} from '../local-core/staff-locale';
import {marketMoney} from './format';
import {marketText} from './locale';
const maxMoney=9223372036854775807n,uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function invalid():never{throw Error('INVALID_MARKET_DETAIL');}
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))invalid();return value as Record<string,unknown>;}
function text(value:unknown,max=1000):string{if(typeof value!=='string'||!value.trim()||value.length>max)invalid();return value;}
function id(value:unknown):string{if(typeof value!=='string'||!uuid.test(value))invalid();return value;}
function money(value:unknown):string{if(typeof value!=='string'||!/^(0|[1-9]\d{0,18})$/.test(value)||BigInt(value)>maxMoney)invalid();return value;}
function array(value:unknown):unknown[]{if(!Array.isArray(value)||value.length>20)invalid();return value;}
/** A bounded display model; unrelated API fields never enter the detail component. */
export function parseMarketDetail(value:unknown){
 const r=object(value),totalMinor=money(r.totalMinor),currency=text(r.currency,3);
 if(!['UZS','USD','EUR'].includes(currency))invalid();
 const lines=array(r.lines).map(value=>{
  const l=object(value),source=object(l.name),name:Record<string,string>={};
  for(const locale of ['ru','uz','en'])if(source[locale]!==undefined)name[locale]=text(source[locale]);
  if(!Object.keys(name).length||!Number.isInteger(l.quantity)||Number(l.quantity)<1||Number(l.quantity)>50)invalid();
  return {serviceId:id(l.serviceId),name,quantity:l.quantity as number,priceMinor:money(l.priceMinor)};
 });
 if(!lines.length||new Set(lines.map(l=>l.serviceId.toLowerCase())).size!==lines.length||lines.reduce((n,l)=>n+BigInt(l.priceMinor)*BigInt(l.quantity),0n)!==BigInt(totalMinor))invalid();
 const creditedMinor=r.creditedMinor===undefined?null:money(r.creditedMinor);
 const credits=r.credits===undefined?[]:array(r.credits).map(value=>{const c=object(value);return {id:id(c.id),amountMinor:money(c.amountMinor),reason:text(c.reason,500)};});
 if(new Set(credits.map(c=>c.id.toLowerCase())).size!==credits.length||credits.some(c=>c.amountMinor==='0'))invalid();
 if(creditedMinor===null?credits.length>0:BigInt(creditedMinor)>BigInt(totalMinor)||credits.reduce((n,c)=>n+BigInt(c.amountMinor),0n)>BigInt(creditedMinor)||BigInt(creditedMinor)>0n&&r.stage!=='completed')invalid();
 let issue:{status:'open'|'answered';note:string;answer:string|null}|null=null;
 if(r.issue!==undefined&&r.issue!==null){const i=object(r.issue);if(i.status!=='open'&&i.status!=='answered')invalid();issue={status:i.status,note:text(i.note),answer:i.answer==null?null:text(i.answer)};}
 return {lines,currency,totalMinor,creditedMinor,credits,issue,replacesOrderId:r.replacesOrderId==null?null:id(r.replacesOrderId),replacedByOrderId:r.replacedByOrderId==null?null:id(r.replacedByOrderId)};
}
const labels:Record<string,[string,string,string]>={
 items:['Состав заказа','Order items','Buyurtma tarkibi'],unitPrice:['Цена за единицу','Unit price','Birlik narxi'],lineTotal:['Сумма позиции','Line total','Tovar summasi'],
};
export function GuestMarketDetail({order:o,locale}:{order:ReturnType<typeof parseMarketDetail>;locale:Locale}){
 const t=(key:string)=>labels[key]?.[['ru','en','uz'].indexOf(locale)]??marketText(locale,key);
 return <section data-testid="guest-market-detail" style={{overflowWrap:'anywhere'}}><h4>{t('items')}</h4>
 <ul>{o.lines.map(l=><li className="localPanel" key={l.serviceId}><strong>{localizedName(l.name,locale)}</strong><p>{t('quantity')}: {l.quantity}</p>
 <p>{t('unitPrice')}: {marketMoney(l.priceMinor,o.currency,locale)}</p><p>{t('lineTotal')}: {marketMoney((BigInt(l.priceMinor)*BigInt(l.quantity)).toString(),o.currency,locale)}</p></li>)}</ul>
 {o.replacesOrderId&&<p>{t('replacesOrder')}: <code>{o.replacesOrderId}</code></p>}{o.replacedByOrderId&&<p>{t('replacedBy')}: <code>{o.replacedByOrderId}</code></p>}
 {o.issue&&<section className="localPanel" aria-label={t('issue')}><h4>{t(o.issue.status==='open'?'issueOpen':'issueAnswered')}</h4><p>{o.issue.note}</p>{o.issue.answer&&<p>{o.issue.answer}</p>}<p>{t('noRefund')}</p></section>}
 {o.creditedMinor!==null&&BigInt(o.creditedMinor)>0n&&<section className="localPanel" data-testid="market-credit-summary"><h4>{t('credited')}: {marketMoney(o.creditedMinor,o.currency,locale)}</h4>
 <p>{t('netCharge')}: {marketMoney((BigInt(o.totalMinor)-BigInt(o.creditedMinor)).toString(),o.currency,locale)}</p><p>{t('creditOnly')}</p>
 <p>{t('recentCredits')}</p><ul>{o.credits.map(c=><li key={c.id}>{c.reason} · −{marketMoney(c.amountMinor,o.currency,locale)}</li>)}</ul></section>}
 </section>;
}
