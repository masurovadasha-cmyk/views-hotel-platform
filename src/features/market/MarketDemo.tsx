import {useEffect,useMemo,useRef,useState} from "react";
import {
  MARKET_CART_KEY,MARKET_STATE_KEY,addCartLine,adjustMarketStock,advanceMarketOrder,availableStock,
  cancelMarketOrder,cartSummary,formatUzs,marketAnalytics,marketSeed,placeDemoOrder,receiveMarketStock,
  type Cart,type MarketState
} from "../../domain/marketModel";
import "./market.css";

type Screen="shop"|"cart"|"orders"|"staff";

function freshState():MarketState{return {products:marketSeed.map(p=>({...p})),orders:[],ledger:[]}}
function isSafeState(x:unknown):x is MarketState{
  if(!x||typeof x!=="object")return false;
  const v=x as MarketState;
  if(!Array.isArray(v.products)||v.products.length!==marketSeed.length||!Array.isArray(v.orders)||!Array.isArray(v.ledger))return false;
  const ids=new Set(marketSeed.map(p=>p.id));const seen=new Set<string>();const held=new Map<string,number>();
  for(const p of v.products){
    if(!p||typeof p.id!=="string"||!ids.has(p.id)||seen.has(p.id)||typeof p.nameRu!=="string"||typeof p.imageUrl!=="string"||!Number.isSafeInteger(p.stock)||!Number.isSafeInteger(p.reserved)||p.stock<0||p.reserved<0||p.reserved>p.stock||!Number.isSafeInteger(p.guestPriceUzs)||p.guestPriceUzs<0)return false;
    seen.add(p.id);
  }
  const orderIds=new Set<string>();const keys=new Set<string>();
  for(const o of v.orders){
    if(!o||typeof o.id!=="string"||typeof o.idempotencyKey!=="string"||orderIds.has(o.id)||keys.has(o.idempotencyKey)||!["new","picking","packed","out_for_delivery","delivered","cancelled"].includes(o.status)||!Array.isArray(o.lines)||!o.lines.length)return false;
    orderIds.add(o.id);keys.add(o.idempotencyKey);
    for(const l of o.lines){
      const p=v.products.find(p=>p.id===l.productId);
      if(!p||p.sku!==l.sku||!Number.isSafeInteger(l.quantity)||l.quantity<1||!Number.isSafeInteger(l.lineTotalUzs)||l.lineTotalUzs<0)return false;
      if(o.status!=="delivered"&&o.status!=="cancelled")held.set(p.id,(held.get(p.id)||0)+l.quantity);
    }
  }
  return v.products.every(p=>p.reserved===(held.get(p.id)||0))&&v.ledger.every(e=>e&&typeof e.id==="string"&&typeof e.sku==="string"&&typeof e.type==="string"&&Number.isSafeInteger(e.quantity));
}
function loadState():MarketState{
  try{
    const raw=localStorage.getItem(MARKET_STATE_KEY);if(!raw)return freshState();
    const parsed:unknown=JSON.parse(raw);
    if(!isSafeState(parsed))throw Error("INVALID_MARKET_STORAGE");
    return parsed;
  }catch{return freshState()}
}
function loadCart():Cart{
  try{
    const parsed:unknown=JSON.parse(localStorage.getItem(MARKET_CART_KEY)||"{}");
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return {};
    const result:Cart={};
    for(const [id,n] of Object.entries(parsed)){
      if(!marketSeed.some(p=>p.id===id)||!Number.isSafeInteger(n)||typeof n!=="number"||n<1)return {};
      result[id]=n;
    }
    return result;
  }catch{return {}}
}
function readableMarketError(error:unknown){
  const code=error instanceof Error?error.message:"CHECKOUT_FAILED";
  if(code==="DEMO_PAYMENT_FAILED")return "Тестовый платёж отклонён. Заказ не создан.";
  if(code==="IDEMPOTENCY_CONFLICT")return "Заказ уже оформлялся с другими параметрами. Обновите корзину.";
  if(code==="INVENTORY_CONFLICT"||code.startsWith("OUT_OF_STOCK:"))return "Остатки изменились. Операция остановлена; обновите страницу.";
  if(code==="STALE_MARKET")return "Другая вкладка изменила демоданные. Перезагрузите страницу.";
  if(code==="INVALID_CART"||code==="INVALID_QUANTITY"||code.startsWith("UNKNOWN_PRODUCT:"))return "Проверьте количество и состав корзины.";
  return "Операция отклонена. Проверьте данные и повторите.";
}
function nextLabel(status:string){
  if(status==="new")return "Start picking";
  if(status==="picking")return "Packed";
  if(status==="packed")return "Out for delivery";
  if(status==="out_for_delivery")return "Delivered";
  return "";
}

function ProductPhoto({src,alt,emoji,className=""}:{src:string;alt:string;emoji:string;className?:string}){
  const [failed,setFailed]=useState(false);
  return <span className={"productPhoto "+className}>
    {failed?<span className="productPhotoFallback" aria-label={alt}>{emoji}</span>:<img src={src} alt={alt} loading="lazy" onError={()=>setFailed(true)}/>}
  </span>;
}

export function MarketDemo(){
  const [state,setState]=useState<MarketState>(loadState);
  const [cart,setCart]=useState<Cart>(loadCart);
  const [screen,setScreen]=useState<Screen>("shop");
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("Все");
  const [staffQuery,setStaffQuery]=useState("");
  const [apartment,setApartment]=useState("#235");
  const [deliverySlot,setDeliverySlot]=useState("Сейчас · 20–35 мин");
  const [comment,setComment]=useState("");
  const [payment,setPayment]=useState<"demo_card"|"room_charge">("demo_card");
  const [paymentOutcome,setPaymentOutcome]=useState<"success"|"failure">("success");
  const [message,setMessage]=useState("");
  const [stale,setStale]=useState(()=>{
    try{
      const raw=localStorage.getItem(MARKET_STATE_KEY);
      if(raw!==null&&!isSafeState(JSON.parse(raw)))return true;
      const cartRaw=localStorage.getItem(MARKET_CART_KEY);
      if(cartRaw!==null){
        const c:unknown=JSON.parse(cartRaw);
        if(!c||typeof c!=="object"||Array.isArray(c))return true;
        for(const [id,n] of Object.entries(c)){
          if(!marketSeed.some(p=>p.id===id)||typeof n!=="number"||!Number.isSafeInteger(n)||n<1)return true;
        }
      }
      return false;
    }catch{return true}
  });
  const initialStateRaw=useRef<string|null>(null);
  const initialCartRaw=useRef<string|null>(null);
  const mounted=useRef(false);
  const [photoProductId,setPhotoProductId]=useState<string|null>(null);
  const checkoutKey=useRef("checkout-"+crypto.randomUUID());

  useEffect(()=>{
    if(mounted.current)return;
    mounted.current=true;
    try{initialStateRaw.current=localStorage.getItem(MARKET_STATE_KEY);initialCartRaw.current=localStorage.getItem(MARKET_CART_KEY)}
    catch{setStale(true);setMessage("Локальное хранилище недоступно.")}
  },[]);
  useEffect(()=>{
    if(!mounted.current||stale)return;
    try{
      if(localStorage.getItem(MARKET_STATE_KEY)!==initialStateRaw.current){setStale(true);return}
      const value=JSON.stringify(state);localStorage.setItem(MARKET_STATE_KEY,value);initialStateRaw.current=value;
    }catch{setStale(true)}
  },[state,stale]);
  useEffect(()=>{
    if(!mounted.current||stale)return;
    try{
      if(localStorage.getItem(MARKET_CART_KEY)!==initialCartRaw.current){setStale(true);return}
      const value=JSON.stringify(cart);localStorage.setItem(MARKET_CART_KEY,value);initialCartRaw.current=value;
    }catch{setStale(true)}
  },[cart,stale]);
  useEffect(()=>{
    const handler=(event:StorageEvent)=>{
      if(event.key===null||event.key===MARKET_STATE_KEY||event.key===MARKET_CART_KEY)setStale(true);
    };
    window.addEventListener("storage",handler);return ()=>window.removeEventListener("storage",handler);
  },[]);
  function assertFresh(){
    if(stale||localStorage.getItem(MARKET_STATE_KEY)!==initialStateRaw.current||localStorage.getItem(MARKET_CART_KEY)!==initialCartRaw.current){
      setStale(true);throw Error("STALE_MARKET");
    }
  }
  function changeState(action:(s:MarketState)=>MarketState){
    try{assertFresh();setState(action(state))}catch(error){setMessage(readableMarketError(error))}
  }

  const categories=useMemo(()=>["Все",...Array.from(new Set(state.products.map(p=>p.category)))],[state.products]);
  const visible=useMemo(()=>state.products.filter(p=>{
    const q=query.trim().toLowerCase();
    return (category==="Все"||p.category===category)&&(!q||(p.nameRu+" "+p.brand+" "+p.sku).toLowerCase().includes(q));
  }),[state.products,category,query]);
  const summary=useMemo(()=>cartSummary(state.products,cart),[state.products,cart]);
  const cartCount=Object.values(cart).reduce((s,n)=>s+n,0);
  const analytics=marketAnalytics(state);
  const staffProducts=state.products.filter(p=>(p.nameRu+" "+p.sku+" "+p.category).toLowerCase().includes(staffQuery.toLowerCase())).slice(0,40);

  function mutateCart(productId:string,delta:number){
    try{assertFresh();const product=state.products.find(p=>p.id===productId);if(!product)return;
      setCart(current=>addCartLine(current,product,delta));checkoutKey.current="checkout-"+crypto.randomUUID();
    }catch(error){setMessage(readableMarketError(error))}
  }
  function checkout(){
    setMessage("");
    try{
      assertFresh();
      const result=placeDemoOrder(state,cart,{
        idempotencyKey:checkoutKey.current,apartment,deliverySlot,comment,payment,paymentOutcome,
        deliveryFeeUzs:10000
      });
      setState(result.state);
      setCart({});
      checkoutKey.current="checkout-"+crypto.randomUUID();
      setComment("");
      setScreen("orders");
      setMessage(result.duplicate?"Повторный запрос распознан — второй заказ не создан.":"Демо-заказ создан и появился в Staff CRM.");
    }catch(error){
      setMessage(readableMarketError(error));
    }
  }
  function resetDemo(){
    if(!window.confirm("Удалить все локальные демозаказы, корзину и движения склада?"))return;
    try{localStorage.removeItem(MARKET_STATE_KEY);localStorage.removeItem(MARKET_CART_KEY);
      initialStateRaw.current=null;initialCartRaw.current=null;setStale(false);
      setState(freshState());setCart({});setScreen("shop");setMessage("Демо-данные рынка сброшены.");checkoutKey.current="checkout-"+crypto.randomUUID();
    }catch{setStale(true);setMessage("Не удалось сбросить демоданные.")}
  }

  return <main className="marketShell">
    <section className="marketHero">
      <div><small>VIEWS · V-MARKET</small><h1>Мини-маркет в номер</h1><p>Полноценный DEMO: каталог, корзина, остатки, заказ, Staff CRM и учёт движения товара.</p></div>
      <div className="marketHeroStats"><span><b>{state.products.length}</b> SKU</span><span><b>{cartCount}</b> в корзине</span><span><b>{state.orders.length}</b> заказов</span></div>
    </section>

    <nav className="marketTabs">
      <button className={screen==="shop"?"active":""} onClick={()=>setScreen("shop")}>Магазин</button>
      <button className={screen==="cart"?"active":""} onClick={()=>setScreen("cart")}>Корзина <b>{cartCount}</b></button>
      <button className={screen==="orders"?"active":""} onClick={()=>setScreen("orders")}>Мои заказы</button>
      <button className={screen==="staff"?"active":""} onClick={()=>setScreen("staff")}>Staff CRM</button>
    </nav>

    {stale&&<div className="marketNotice" role="alert">Демоданные изменились в другой вкладке или недоступны. Новые операции заблокированы. <button onClick={()=>window.location.reload()}>Перезагрузить</button></div>}
    {message&&<div className="marketNotice" role="status">{message}</div>}

    {screen==="shop"&&<section>
      <div className="marketToolbar">
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск товара, бренда или SKU…"/>
        <select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(c=><option key={c}>{c}</option>)}</select>
        <span>DEMO prices · 25% markup</span>
      </div>
      <div className="marketCategoryRail">{categories.map(c=><button key={c} className={category===c?"active":""} onClick={()=>setCategory(c)}>{c}</button>)}</div>
      <div className="marketGrid">{visible.map(p=>{
        const available=availableStock(p);const q=cart[p.id]||0;
        return <article className="marketCard" key={p.id}>
          <button className="marketPhotoButton" aria-label={"Открыть фото: "+p.nameRu} onClick={()=>setPhotoProductId(p.id)}><ProductPhoto src={p.imageUrl} alt={p.imageAlt} emoji={p.emoji}/></button>
          <div className="marketCardTop"><span>{p.category}</span><i className={p.storage}>{p.storage}</i></div>
          <h3>{p.nameRu}</h3><p>{p.brand} · {p.unit}</p>
          <div className="marketPrice"><strong>{formatUzs(p.guestPriceUzs)}</strong><small>{p.priceStatus==="verified_reference"?"public reference 2026":"demo reference"} · +25%</small></div>
          <div className="stockLine"><span className={available<=p.reorderPoint?"low":""}>{available>0?available+" доступно":"Нет в наличии"}</span><code>{p.sku}</code></div>
          {q===0?<button className="marketPrimary" disabled={!available} onClick={()=>mutateCart(p.id,1)}>Добавить</button>:
            <div className="qtyControl"><button onClick={()=>mutateCart(p.id,-1)}>−</button><b>{q}</b><button disabled={q>=available} onClick={()=>mutateCart(p.id,1)}>+</button></div>}
        </article>;
      })}</div>
    </section>}

    {screen==="cart"&&<section className="marketTwoCol">
      <div className="marketPanel"><header><small>GUEST CHECKOUT</small><h2>Корзина</h2></header>
        {!summary.lines.length?<div className="marketEmpty"><b>Корзина пуста</b><p>Добавьте товары из каталога.</p><button onClick={()=>setScreen("shop")}>Открыть магазин</button></div>:
        <div className="cartLines">{summary.lines.map(line=><article key={line.productId}>
          <div className="cartProductInfo">{state.products.find(p=>p.id===line.productId)&&<ProductPhoto className="thumb" src={state.products.find(p=>p.id===line.productId)!.imageUrl} alt={line.name} emoji={state.products.find(p=>p.id===line.productId)!.emoji}/>}<div><b>{line.name}</b><small>{line.sku} · {formatUzs(line.unitPriceUzs)}</small></div></div>
          <div className="qtyControl"><button onClick={()=>mutateCart(line.productId,-1)}>−</button><b>{line.quantity}</b><button onClick={()=>mutateCart(line.productId,1)}>+</button></div>
          <strong>{formatUzs(line.lineTotalUzs)}</strong>
        </article>)}</div>}
      </div>
      <aside className="marketCheckout">
        <small>ДОСТАВКА В АПАРТАМЕНТ</small>
        <label>Апартамент<input value={apartment} onChange={e=>setApartment(e.target.value)}/></label>
        <label>Доставка<select value={deliverySlot} onChange={e=>setDeliverySlot(e.target.value)}><option>Сейчас · 20–35 мин</option><option>Сегодня · 18:00–19:00</option><option>Сегодня · 20:00–21:00</option></select></label>
        <label>Комментарий<textarea value={comment} onChange={e=>setComment(e.target.value)} placeholder="Например: оставить у двери"/></label>
        <label>Оплата<select value={payment} onChange={e=>setPayment(e.target.value as "demo_card"|"room_charge")}><option value="demo_card">DEMO •••• 4582</option><option value="room_charge">Записать на номер (DEMO)</option></select></label>
        {payment==="demo_card"&&<label>Тест результата<select value={paymentOutcome} onChange={e=>setPaymentOutcome(e.target.value as "success"|"failure")}><option value="success">Успешный тестовый платёж</option><option value="failure">Отклонённый тестовый платёж</option></select></label>}
        <div className="marketTotals"><span>Товары<b>{formatUzs(summary.subtotalUzs)}</b></span><span>Доставка<b>{formatUzs(summary.deliveryFeeUzs)}</b></span><strong>Итого <b>{formatUzs(summary.totalUzs)}</b></strong></div>
        <p className="demoWarning">DEMO ONLY. Настоящие реквизиты карты не вводятся и не сохраняются.</p>
        <button className="marketPrimary big" disabled={stale||!summary.lines.length||!apartment.trim()} onClick={checkout}>Заказать демо</button>
      </aside>
    </section>}

    {screen==="orders"&&<section className="marketPanel"><header><small>ORDER HISTORY</small><h2>Мои заказы</h2></header>
      {!state.orders.length?<div className="marketEmpty"><b>Заказов пока нет</b><p>Оформите первый демо-заказ в V-Market.</p></div>:
      <div className="orderCards">{state.orders.map(o=><article key={o.id}>
        <header><div><small>{new Date(o.createdAt).toLocaleString("ru-RU")}</small><h3>{o.id}</h3></div><span className={"marketStatus "+o.status}>{o.status.replaceAll("_"," ")}</span></header>
        <p>{o.apartment} · {o.deliverySlot} · {o.paymentStatus.replaceAll("_"," ")}</p>
        <div className="orderMiniLines">{o.lines.map(l=>{const p=state.products.find(x=>x.sku===l.sku);return <span key={l.sku}>{p&&<ProductPhoto className="micro" src={p.imageUrl} alt={l.name} emoji={p.emoji}/>}<i>{l.name} × {l.quantity}</i><b>{formatUzs(l.lineTotalUzs)}</b></span>})}</div>
        <strong className="orderTotal">{formatUzs(o.totalUzs)}</strong>
      </article>)}</div>}
    </section>}

    {screen==="staff"&&<section className="staffMarket">
      <div className="marketKpis">
        <article><small>Delivered sales</small><b>{formatUzs(analytics.salesUzs)}</b></article>
        <article><small>Delivered orders</small><b>{analytics.orders}</b></article>
        <article><small>AOV</small><b>{formatUzs(analytics.aovUzs)}</b></article>
        <article><small>Low stock</small><b>{analytics.lowStock}</b></article>
      </div>
      <div className="marketTwoCol staffCols">
        <div className="marketPanel"><header><small>STAFF CRM</small><h2>Market Orders</h2></header>
          <div className="staffOrders">{state.orders.length===0?<div className="marketEmpty">Нет заказов</div>:state.orders.map(o=><article key={o.id}>
            <div><b>{o.id}</b><small>{o.apartment} · {o.lines.reduce((s,l)=>s+l.quantity,0)} items · {formatUzs(o.totalUzs)}</small></div>
            <span className={"marketStatus "+o.status}>{o.status.replaceAll("_"," ")}</span>
            <div className="staffOrderThumbs">{o.lines.slice(0,4).map(l=>{const p=state.products.find(x=>x.sku===l.sku);return p?<ProductPhoto key={l.sku} className="micro" src={p.imageUrl} alt={l.name} emoji={p.emoji}/>:null})}</div>
            <div className="staffActions">
              {nextLabel(o.status)&&<button className="marketPrimary" onClick={()=>changeState(s=>advanceMarketOrder(s,o.id))}>{nextLabel(o.status)}</button>}
              {!["delivered","cancelled"].includes(o.status)&&<button onClick={()=>changeState(s=>cancelMarketOrder(s,o.id))}>Cancel + release</button>}
            </div>
          </article>)}</div>
        </div>
        <div className="marketPanel"><header><small>INVENTORY</small><h2>Stock control</h2></header>
          <input className="staffSearch" value={staffQuery} onChange={e=>setStaffQuery(e.target.value)} placeholder="SKU / товар / категория"/>
          <div className="inventoryRows">{staffProducts.map(p=><article key={p.id}>
            <div className="inventoryProductCell"><ProductPhoto className="micro" src={p.imageUrl} alt={p.imageAlt} emoji={p.emoji}/><div><b>{p.nameRu}</b><small>{p.sku} · {p.category}</small></div></div>
            <span>stock <b>{p.stock}</b></span><span>reserved <b>{p.reserved}</b></span><span className={availableStock(p)<=p.reorderPoint?"low":""}>available <b>{availableStock(p)}</b></span>
            <div><button onClick={()=>changeState(s=>receiveMarketStock(s,p.id,5))}>Receive +5</button><button onClick={()=>changeState(s=>adjustMarketStock(s,p.id,-1,"demo cycle-count adjustment"))}>Adjust −1</button></div>
          </article>)}</div>
        </div>
      </div>
      <div className="marketPanel ledgerPanel"><header><small>IMMUTABLE DEMO LEDGER</small><h2>Последние движения</h2></header>
        <div className="ledgerRows">{state.ledger.slice(-20).reverse().map(e=><article key={e.id}><code>{e.sku}</code><b>{e.type}</b><span>{e.quantity>0?"+":""}{e.quantity}</span><small>{e.reason||e.orderId||"—"}</small></article>)}</div>
      </div>
      <button className="resetDemo" onClick={resetDemo}>Сбросить V-Market demo data</button>
    </section>}
    {photoProductId&&(()=>{
      const p=state.products.find(x=>x.id===photoProductId);
      return p?<div className="marketPhotoModal" onMouseDown={e=>{if(e.target===e.currentTarget)setPhotoProductId(null)}}>
        <div className="marketPhotoModalCard">
          <button className="marketPhotoClose" onClick={()=>setPhotoProductId(null)}>Close</button>
          <ProductPhoto className="large" src={p.imageUrl} alt={p.imageAlt} emoji={p.emoji}/>
          <small>{p.category} · {p.sku}</small><h2>{p.nameRu}</h2><p>{p.brand} · {p.unit}</p>
          <strong>{formatUzs(p.guestPriceUzs)}</strong>
        </div>
      </div>:null
    })()}
  </main>;
}
