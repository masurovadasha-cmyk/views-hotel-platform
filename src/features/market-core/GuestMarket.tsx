import {useState} from 'react';
import {guestEmailRequest} from '../../api/guest-email';
import {useGuestLocale} from '../guest/GuestLocale';
import {localizedName} from '../local-core/staff-locale';
import {useCleaning} from '../service-orders/useCleaning';
import type {Page} from '../service-orders/model';
import {marketText} from './locale';
import {cartTotal,validCart,replacementProduct,type CartLine,type MarketProduct,type MarketOrder} from './model';
import {MarketOrderCard,marketMoney} from './MarketOrderCard';
export function GuestMarket({reservationId,csrf,online,onPending,onExpired,canRequest}:{reservationId:string;csrf:string;online:boolean;onPending:(v:boolean)=>void;onExpired:()=>void;canRequest:boolean}){
 const {locale}=useGuestLocale(),t=(k:string)=>marketText(locale,k);
 const [opened,setOpened]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[consent,setConsent]=useState(false);
 const [catalog,setCatalog]=useState<Page<MarketProduct>>({items:[],nextCursor:null}),[orders,setOrders]=useState<Page<MarketOrder>>({items:[],nextCursor:null}),[cart,setCart]=useState<CartLine[]>([]);
 const [replacing,setReplacing]=useState<MarketOrder|null>(null);
 const products=catalog.items.map(p=>replacementProduct(p,replacing));
 const query='?reservationId='+reservationId;
 async function load(kind:'catalog'|'orders',cursor?:string){const page=await guestEmailRequest('services/market'+(kind==='catalog'?'/catalog':'')+query+(cursor?'&cursor='+cursor:''));if(kind==='catalog')setCatalog(page as unknown as Page<MarketProduct>);else setOrders(page as unknown as Page<MarketOrder>);}
 async function refresh(kind?:'catalog'|'orders',cursor?:string){setLoading(true);setError('');try{if(kind)await load(kind,cursor);else{setReplacing(null);setCart([]);setConsent(false);await Promise.all([load('orders'),...(canRequest?[load('catalog')]:[])]);}}catch(e){setReplacing(null);setCart([]);setConsent(false);setCatalog({items:[],nextCursor:null});setOrders({items:[],nextCursor:null});if(e instanceof Error&&/SESSION_INVALID/.test(e.message))onExpired();else setError('unavailable');}finally{setLoading(false);}}
 function editOrder(o:MarketOrder){setReplacing(o);setCart([]);setConsent(false);}
 const state=useCleaning(a=>guestEmailRequest(a.route,a.body,csrf,a.key),()=>refresh(),onPending,onExpired);
 const disabled=state.busy||!!state.pending||loading||!online;
 function quantity(product:MarketProduct,value:number){setConsent(false);setCart(old=>{const rest=old.filter(l=>l.product.id!==product.id);return Number.isInteger(value)&&value>0?[...rest,{product,quantity:value}]:rest;});}
 return <section className="localPanel" data-testid="guest-market-core"><h3>{t('title')}</h3>
 {!opened?<button disabled={!online} onClick={()=>{setOpened(true);void refresh();}}>{t('open')}</button>:<><p>{t('pilot')}</p>
 {!online&&<p role="status">{t('offline')}</p>}{loading&&<p role="status">{t('loading')}</p>}{error&&<p role="alert">{t(error)}</p>}{state.message&&<p role="status">{t(state.message)}</p>}
 {state.pending&&<button disabled={state.busy||!online} onClick={()=>void state.act(state.pending!)}>{t('retry')}</button>}
 {canRequest&&<form onSubmit={e=>{e.preventDefault();if(!consent||!validCart(cart))return;void state.act({route:replacing?`services/market/${replacing.orderId}/actions`:'services/market',key:crypto.randomUUID(),body:{...(replacing?{action:'replace_order',expectedRevision:replacing.revision}:{reservationId}),expectedTotalMinor:cartTotal(cart),lines:cart.map(l=>({serviceId:l.product.id,quantity:l.quantity,expectedRevision:l.product.revision}))}});}}><fieldset disabled={disabled}><legend>{t('catalog')}</legend>
 {replacing&&<aside data-testid="market-replacement"><h4>{t('editBasket')}</h4><p>{t('replacementTerms')}</p><p>{t('previousTotal')}: {marketMoney(replacing.totalMinor,replacing.currency,locale)}</p><button type="button" onClick={()=>{setReplacing(null);setCart([]);setConsent(false);}}>{t('stopEditing')}</button></aside>}
 {products.map(p=><article className="localPanel" key={p.id} data-product-id={p.id}><h4>{localizedName(p.name,locale)}</h4><p>{marketMoney(p.priceMinor,p.currency,locale)} · {t('available')}: {p.availableQuantity}</p><label>{t('quantity')}<input type="number" min={0} max={Number(BigInt(p.availableQuantity)>50n?50n:BigInt(p.availableQuantity))} step={1} value={cart.find(l=>l.product.id===p.id)?.quantity||0} onChange={e=>quantity(p,e.target.valueAsNumber)}/></label></article>)}
 <h4>{t('cart')}</h4>{!cart.length?<p>{t('emptyCart')}</p>:<ul>{cart.map(l=><li key={l.product.id}>{localizedName(l.product.name,locale)} × {l.quantity}<button type="button" onClick={()=>quantity(l.product,0)}>× <span>{localizedName(l.product.name,locale)}</span></button></li>)}</ul>}
 <p>{t('limit')}</p>{cart.length>0&&<p>{t('total')}: {marketMoney(cartTotal(cart),cart[0].product.currency,locale)}</p>}<p>{t('terms')}</p>
 <label><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>{t('consent')}</label><button disabled={!consent||!validCart(cart)}>{t(replacing?'replaceBasket':'request')}</button></fieldset></form>}
 {canRequest&&catalog.nextCursor&&<button disabled={disabled} onClick={()=>void refresh('catalog',catalog.nextCursor!)}>{t('catalog')} · {t('next')}</button>}
 {!loading&&!error&&!orders.items.length&&<p>{t('empty')}</p>}{orders.items.map(o=><MarketOrderCard key={o.orderId+':'+o.revision} order={o} locale={locale} disabled={disabled} onReplace={canRequest?()=>editOrder(o):undefined} onAction={(action,fields={})=>void state.act({route:`services/market/${o.orderId}/actions`,key:crypto.randomUUID(),body:{action,expectedRevision:o.revision,...fields}})}/>)}
 <button disabled={disabled} onClick={()=>void refresh()}>{t('refresh')}</button>{orders.nextCursor&&<button disabled={disabled} onClick={()=>void refresh('orders',orders.nextCursor!)}>{t('next')}</button>}</>}</section>;
}
