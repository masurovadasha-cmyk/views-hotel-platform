import {useState} from 'react';
import {Coffee,Droplets,Apple,Package,ShoppingBag} from 'lucide-react';
import {useGuestLocale} from './GuestLocale';
import {translate} from '../../i18n/messages';
import messages from './market-translations.json';
import {marketProducts,marketCategories,marketCartLines,type MarketCategory,type MarketProduct} from './market-catalog';
import './guest-market.css';
import {demoBalance,demoAvailable} from './demo-market';
import {DemoMarketRecovery} from './DemoMarketRecovery';
import {useDemoMarket} from './useDemoMarket';
const icons={Drinks:Droplets,Breakfast:Coffee,Snacks:Apple,Essentials:Package};
function MarketPhoto({product,t}:{product:MarketProduct;t:(key:string)=>string}){
 const [failed,setFailed]=useState(false),photo=product.photo,Icon=icons[product.category];
 return <figure className="marketPhoto"><div className="marketIllustration">{photo&&!failed?<img src={photo.src} alt={t('Illustrative demo photo')+': '+t(product.name)} onError={()=>setFailed(true)} width={photo.dimensions[0]} height={photo.dimensions[1]} decoding="async"/>:<><Icon size={40} aria-hidden="true"/><span>{t('Photo unavailable')}</span></>}</div><figcaption>{t('Illustrative demo photo. Packaging and quantity may differ; not a supplier SKU photo.')}{photo&&<details><summary>{t('Photo credit and license')}</summary><a href={photo.source} target="_blank" rel="noreferrer">{photo.title}</a> · {photo.author} · <a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license}</a><p>{t('Resized and converted to WebP. The photo retains its original license.')}</p></details>}</figcaption></figure>;
}
export function GuestMarket(){
 const {locale}=useGuestLocale(),t=(key:string)=>translate(messages,locale,key);
 const [category,setCategory]=useState<MarketCategory|'All'>('All'),[search,setSearch]=useState('');
 const market=useDemoMarket(),{state,blocked,error,act}=market,cart=state.cart,pending=state.pending;
 const lines=marketCartLines(cart),count=lines.reduce((sum,line)=>sum+line.quantity,0);
 const products=marketProducts.filter(product=>(category==='All'||product.category===category)&&`${t(product.name)} ${t(product.category)}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 function change(id:string,quantity:number){act({type:'quantity',id,quantity});}
 if(market.loading||(blocked&&error==='storage'))return <section className="guestMarket" data-testid="guest-market"><DemoMarketRecovery {...market} locale={locale}/></section>;
 return <section className="guestMarket" data-testid="guest-market" aria-labelledby="market-title">
  <header className="marketHero"><div><small>VIEWS · V MARKET</small><h2 id="market-title">{t('Everyday essentials, close to you.')}</h2><p>{t('Build your shopping list for your stay.')}</p></div><ShoppingBag size={48} aria-hidden="true"/></header>
  <p className="notice">{t('Local demo only. Each sample starts with 10 units. Orders and stock are simulated on this device; no payment, delivery or real stock movement occurs.')}</p>
  <p>{t('Prices are not configured. Currency: UZS. No amount is charged.')}</p><DemoMarketRecovery {...market} locale={locale}/>
  {(!market.loading&&!market.busy&&!market.conflict&&error&&error!=='changed'&&error!=='storage')&&<p role="alert">{t(error==='stock'?'Not enough demo stock. Reduce the quantity.':error==='limit'?'Demo history limit reached. No new orders can be created.':'Demo storage is unavailable or invalid. No change was confirmed. Restore storage access and reload; existing data has not been reset.')}</p>}
  <fieldset disabled={blocked}><label className="marketSearch">{t('Find a product')}<input type="search" maxLength={100} value={search} onChange={event=>setSearch(event.target.value)}/></label>
  <div className="marketFilters" aria-label={t('Product categories')}>{(['All',...marketCategories] as const).map(value=><button key={value} aria-pressed={category===value} onClick={()=>setCategory(value)}>{t(value)}</button>)}</div>
  <div className="marketLayout"><div className="marketProducts">
   {!products.length&&<p role="status">{t('No matching products. Change the search or category.')}</p>}
   {products.map(product=>{return <article className="marketProduct" key={product.id} data-product={product.id}><MarketPhoto product={product} t={t}/><small>{t(product.category)} · {t(product.size)}</small><h3>{t(product.name)}</h3><p>{t('Price not set')} · UZS</p><p>{t('Demo available')}: <strong data-stock={product.id}>{demoBalance(state,product.id).available}</strong></p>{state.editingOrderId&&<p>{t('Available for replacement')}: <strong data-edit-stock={product.id}>{demoAvailable(state,product.id)}</strong></p>}<button onClick={()=>change(product.id,(cart[product.id]||0)+1)} disabled={!!pending||(cart[product.id]||0)>=20} aria-label={t('Add to list')+': '+t(product.name)}>{t('Add to list')}</button></article>;})}
  </div><aside className="marketBasket" aria-labelledby="market-basket-title"><h3 id="market-basket-title">{t('Your shopping list')}</h3><p aria-live="polite">{t('Items')}: <strong data-testid="market-count">{count}</strong></p>
   {!lines.length?<p>{t('Your list is empty. Add something from the catalogue.')}</p>:<ul>{lines.map(({product,quantity})=><li key={product.id}><b>{t(product.name)}</b><div className="marketQuantity"><button aria-label={t('Decrease')+': '+t(product.name)} disabled={!!pending} onClick={()=>change(product.id,quantity-1)}>−</button><output aria-label={t('Quantity')+': '+t(product.name)}>{quantity}</output><button disabled={!!pending||quantity>=20} aria-label={t('Increase')+': '+t(product.name)} onClick={()=>change(product.id,quantity+1)}>+</button><button disabled={!!pending} className="marketRemove" aria-label={t('Remove')+': '+t(product.name)} onClick={()=>change(product.id,0)}>{t('Remove')}</button></div></li>)}</ul>}
   {state.editingOrderId&&<div data-testid="demo-market-editing"><p>{t('Editing demo order')}: {state.editingOrderId}</p><p>{t('The original stays reserved until you confirm its replacement.')}</p><button disabled={!!pending} onClick={()=>act({type:'stop-edit'})}>{t('Cancel editing')}</button></div>}
   <p>{t('Total')}: <strong>{t('Awaiting prices')}</strong></p><p>{t('Up to 20 per item. Demo availability is checked before confirmation.')}</p>
   <button className="primary" disabled={!lines.length||!!pending} onClick={()=>act({type:'prepare'})}>{t('Review demo order')}</button>
   <button disabled={!lines.length||!!pending} onClick={()=>act({type:'clear'})}>{t('Clear list')}</button>
   {pending&&<div className="marketReview" data-testid="market-review"><h4>{t('Confirm local demo order')}</h4><p>{pending.id}</p>{pending.replacesOrderId&&<p>{t('Replaces demo order')}: {pending.replacesOrderId}</p>}{marketCartLines(pending.lines).map(({product,quantity})=><p key={product.id}>{t(product.name)} × {quantity}</p>)}<p>{t('No payment or delivery. Confirm reserves demo quantities only.')}</p><button className="primary" onClick={()=>act({type:'confirm',id:pending.id})}>{t('Confirm demo order')}</button><button onClick={()=>act({type:'discard'})}>{t('Back to basket')}</button></div>}
  </aside></div>
  <section className="marketHistory" data-testid="demo-market-history"><h3>{t('Demo order history')}</h3><p>{t('To edit an order, first clear or confirm your current shopping list.')}</p>{!state.orders.length&&<p>{t('No demo orders yet.')}</p>}{state.orders.map(order=><article className="marketBasket" key={order.id} data-demo-order={order.id}><h4>{order.id} · {t(order.status==='reserved'?'Demo reserved':order.status==='completed'?'Demo completed':'Demo cancelled')}</h4>{marketCartLines(order.lines).map(({product,quantity})=><p key={product.id}>{t(product.name)} × {quantity}</p>)}{order.replacesOrderId&&<p>{t('Replaces demo order')}: {order.replacesOrderId}</p>}{order.replacedByOrderId&&<p>{t('Replaced by demo order')}: {order.replacedByOrderId}</p>}<p>{t('Not charged')} · UZS</p>{order.status==='reserved'&&<><button disabled={!!pending||!!state.editingOrderId||lines.length>0} onClick={()=>act({type:'edit',id:order.id})}>{t('Edit demo order')}</button><button disabled={!!pending||!!state.editingOrderId} onClick={()=>act({type:'complete',id:order.id})}>{t('Simulate fulfilment')}</button><button disabled={!!pending||!!state.editingOrderId} onClick={()=>act({type:'cancel',id:order.id})}>{t('Cancel demo order')}</button></>}</article>)}</section>
  <details data-testid="demo-market-accounting"><summary>{t('Demo stock accounting')}</summary><p>{t('Reserved units reduce availability. Cancellation releases them; simulated fulfilment consumes them. This does not update a real warehouse.')}</p>{marketProducts.map(product=>{const balance=demoBalance(state,product.id);return <p key={product.id}>{t(product.name)}: {t('Demo available')} {balance.available} · {t('Demo reserved')} {balance.reserved} · {t('Demo consumed')} {balance.consumed}</p>;})}</details></fieldset>
 </section>;
}
