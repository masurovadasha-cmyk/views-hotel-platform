import {useState} from 'react';
import {Coffee,Droplets,Apple,Package,ShoppingBag} from 'lucide-react';
import {useGuestLocale} from './GuestLocale';
import {translate} from '../../i18n/messages';
import messages from './market-translations.json';
import {marketProducts,marketCategories,marketCartLines,setMarketQuantity,type MarketCart,type MarketCategory} from './market-catalog';
import './guest-market.css';
const icons={Drinks:Droplets,Breakfast:Coffee,Snacks:Apple,Essentials:Package};
export function GuestMarket({cart,onChange}:{cart:MarketCart;onChange:(cart:MarketCart)=>void}){
 const {locale}=useGuestLocale(),t=(key:string)=>translate(messages,locale,key);
 const [category,setCategory]=useState<MarketCategory|'All'>('All'),[search,setSearch]=useState(''),[review,setReview]=useState(false);
 const lines=marketCartLines(cart),count=lines.reduce((sum,line)=>sum+line.quantity,0);
 const products=marketProducts.filter(product=>(category==='All'||product.category===category)&&`${t(product.name)} ${t(product.category)}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
 function change(id:string,quantity:number){onChange(setMarketQuantity(cart,id,quantity));setReview(false);}
 return <section className="guestMarket" data-testid="guest-market" aria-labelledby="market-title">
  <header className="marketHero"><div><small>VIEWS · V MARKET</small><h2 id="market-title">{t('Everyday essentials, close to you.')}</h2><p>{t('Build your shopping list for your stay.')}</p></div><ShoppingBag size={48} aria-hidden="true"/></header>
  <p className="notice">{t('Demo assortment. Prices, stock and delivery are not connected. This list does not create an order or reserve goods.')}</p>
  <label className="marketSearch">{t('Find a product')}<input type="search" maxLength={100} value={search} onChange={event=>setSearch(event.target.value)}/></label>
  <div className="marketFilters" aria-label={t('Product categories')}>{(['All',...marketCategories] as const).map(value=><button key={value} aria-pressed={category===value} onClick={()=>setCategory(value)}>{t(value)}</button>)}</div>
  <div className="marketLayout"><div className="marketProducts">
   {!products.length&&<p role="status">{t('No matching products. Change the search or category.')}</p>}
   {products.map(product=>{const Icon=icons[product.category];return <article className="marketProduct" key={product.id} data-product={product.id}><div className="marketIllustration"><Icon size={40} aria-hidden="true"/></div><small>{t(product.category)} · {t(product.size)}</small><h3>{t(product.name)}</h3><p>{t('Price not set')}</p><button onClick={()=>change(product.id,(cart[product.id]||0)+1)} disabled={(cart[product.id]||0)>=20} aria-label={t('Add to list')+': '+t(product.name)}>{t('Add to list')}</button></article>;})}
  </div><aside className="marketBasket" aria-labelledby="market-basket-title"><h3 id="market-basket-title">{t('Your shopping list')}</h3><p aria-live="polite">{t('Items')}: <strong data-testid="market-count">{count}</strong></p>
   {!lines.length?<p>{t('Your list is empty. Add something from the catalogue.')}</p>:<ul>{lines.map(({product,quantity})=><li key={product.id}><b>{t(product.name)}</b><div className="marketQuantity"><button aria-label={t('Decrease')+': '+t(product.name)} onClick={()=>change(product.id,quantity-1)}>−</button><output aria-label={t('Quantity')+': '+t(product.name)}>{quantity}</output><button disabled={quantity>=20} aria-label={t('Increase')+': '+t(product.name)} onClick={()=>change(product.id,quantity+1)}>+</button><button className="marketRemove" aria-label={t('Remove')+': '+t(product.name)} onClick={()=>change(product.id,0)}>{t('Remove')}</button></div></li>)}</ul>}
   <p>{t('Total')}: <strong>{t('Awaiting prices')}</strong></p><p>{t('Up to 20 of each sample item. The list stays in this session; reloading clears it.')}</p>
   <button className="primary" disabled={!lines.length} onClick={()=>setReview(true)}>{t('Review list')}</button>
   <button disabled={!lines.length} onClick={()=>{onChange({});setReview(false);}}>{t('Clear list')}</button>
   {review&&<div className="marketReview" role="status" data-testid="market-review"><h4>{t('Shopping list — not sent')}</h4>{lines.map(({product,quantity})=><p key={product.id}>{t(product.name)} × {quantity}</p>)}<p>{t('Checkout will be available after the property connects its product catalogue, prices and fulfilment. No payment or stock movement has occurred.')}</p></div>}
  </aside></div>
 </section>;
}
