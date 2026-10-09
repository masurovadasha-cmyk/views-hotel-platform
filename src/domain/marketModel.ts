export type StorageType="ambient"|"chilled"|"frozen";
export type PriceStatus="verified_reference"|"demo_reference";
export type MarketOrderStatus="new"|"picking"|"packed"|"out_for_delivery"|"delivered"|"cancelled";
export type PaymentStatus="demo_paid"|"room_charge"|"failed";
export type LedgerType="RESERVE"|"RELEASE"|"SALE"|"RECEIVE"|"ADJUSTMENT"|"WRITE_OFF";

export interface MarketProduct{
  id:string; sku:string; nameRu:string; nameUz:string; nameEn:string; brand:string; category:string; unit:string;
  referenceCostUzs:number; markupPercent:number; guestPriceUzs:number; priceStatus:PriceStatus; sourceLabel:string; sourceDate:string;
  storage:StorageType; stock:number; reserved:number; reorderPoint:number; emoji:string; imageUrl:string; imageAlt:string;
}
export interface MarketOrderLine{productId:string;sku:string;name:string;quantity:number;unitPriceUzs:number;lineTotalUzs:number}
export interface MarketOrder{
  id:string; idempotencyKey:string; createdAt:string; status:MarketOrderStatus; apartment:string; deliverySlot:string; comment:string;
  paymentStatus:PaymentStatus; subtotalUzs:number; deliveryFeeUzs:number; totalUzs:number; lines:MarketOrderLine[];
}
export interface InventoryLedgerEntry{ id:string; createdAt:string; sku:string; type:LedgerType; quantity:number; orderId?:string; reason?:string }
export interface MarketState{products:MarketProduct[];orders:MarketOrder[];ledger:InventoryLedgerEntry[]}
export type Cart=Record<string,number>;

export const MARKET_STATE_KEY="views-market-state-v2";
export const MARKET_CART_KEY="views-market-cart-v2";

export function priceWithMarkup(cost:number,markupPercent=25){
  return Math.ceil((cost*(1+markupPercent/100))/100)*100;
}
export function availableStock(p:MarketProduct){return Math.max(0,p.stock-p.reserved)}
export function formatUzs(v:number){return new Intl.NumberFormat("ru-RU").format(v)+" UZS"}

type Blueprint={category:string;storage:StorageType;emoji:string;items:[string,string,string,number,boolean][]};
const blueprint:Blueprint[]=[
{category:"Вода",storage:"ambient",emoji:"💧",items:[
["Hydrolife без газа 1.5 л","Hydrolife","1.5 л",5190,false],["Hydrolife газ 1.5 л","Hydrolife","1.5 л",5190,false],["Chortoq минеральная 1.5 л","Chortoq","1.5 л",13490,true],["Santal негазированная 1 л","Santal","1 л",7900,false],["BonAqua без газа 1.5 л","BonAqua","1.5 л",6900,false],["Borjomi минеральная","Borjomi","0.5 л",21900,false]]},
{category:"Напитки",storage:"ambient",emoji:"🥤",items:[
["Coca-Cola","Coca-Cola","1.5 л",12890,true],["Fanta Orange","Fanta","1.5 л",12890,true],["Sprite","Sprite","1.5 л",13390,true],["Pepsi Zero","Pepsi","1.5 л",10890,true],["Schweppes Tonic","Schweppes","1 л",16900,false],["Sanpellegrino Aranciata","Sanpellegrino","0.33 л",24900,false]]},
{category:"Соки и энергетики",storage:"ambient",emoji:"🧃",items:[
["Red Bull","Red Bull","250 мл",16490,true],["TIP-TOP яблоко","TIP-TOP","1 л",12390,true],["Сочная Долина яблоко","Сочная Долина","1 л",12890,true],["Bliss мультифрукт","Bliss","1 л",11990,true],["Rich апельсин","Rich","1 л",21900,false],["J7 яблоко","J7","1 л",19900,false]]},
{category:"Снеки",storage:"ambient",emoji:"🥨",items:[
["Lay's Сметана и зелень","Lay's","140 г",22900,false],["Pringles Original","Pringles","165 г",42900,false],["Doritos Nacho","Doritos","130 г",26900,false],["Cheetos Cheese","Cheetos","130 г",21900,false],["Фисташки жареные","Premium Nuts","150 г",49900,false],["Миндаль жареный","Premium Nuts","150 г",45900,false]]},
{category:"Шоколад и сладости",storage:"ambient",emoji:"🍫",items:[
["Ritter Sport Alpenmilch","Ritter Sport","100 г",23900,false],["Lindt Excellence 70%","Lindt","100 г",46900,false],["KitKat 4 Finger","KitKat","41.5 г",9900,false],["Snickers","Snickers","50 г",8900,false],["Kinder Bueno","Kinder","43 г",15900,false],["Milka Alpine Milk","Milka","90 г",18900,false]]},
{category:"Молочная продукция",storage:"chilled",emoji:"🥛",items:[
["Lactel молоко 6%","Lactel","1 л",16490,true],["Pure молоко","Pure","1 л",13290,true],["Activia питьевой йогурт","Activia","270 г",17190,true],["Actimel Kids","Actimel","95 г",8490,true],["Греческий йогурт","ДДУ","330 г",20890,true],["Musaffo кефир 2.5%","Musaffo","900 г",16290,false]]},
{category:"Сыры и гастрономия",storage:"chilled",emoji:"🧀",items:[
["Gouda premium slices","V-Market Select","200 г",38900,false],["Parmesan wedge","V-Market Select","150 г",64900,false],["Mozzarella","Galbani","125 г",32900,false],["Cheddar slices","Hochland","150 г",29900,false],["Rozmetov вареная колбаса","Rozmetov","400 г",54990,true],["Индейка нарезка premium","V-Market Select","150 г",42900,false]]},
{category:"Мясо и птица",storage:"chilled",emoji:"🥩",items:[
["Куриное филе","V-Market Fresh","500 г",42900,false],["Говядина вырезка","V-Market Fresh","500 г",89900,false],["Стейк ribeye chilled","V-Market Fresh","300 г",119900,false],["Фарш говяжий","V-Market Fresh","500 г",69900,false],["Крылья куриные","V-Market Fresh","600 г",39900,false],["Филе индейки","V-Market Fresh","500 г",57900,false]]},
{category:"Заморозка",storage:"frozen",emoji:"❄️",items:[
["Овощная смесь","Bonduelle","400 г",28900,false],["Картофель фри","McCain","750 г",46900,false],["Пельмени premium","V-Market Select","500 г",54900,false],["Наггетсы куриные","Miratorg","300 г",39900,false],["Мороженое Magnum","Magnum","1 шт",24900,false],["Мороженое Mövenpick","Mövenpick","500 мл",74900,false]]},
{category:"Хлеб и яйца",storage:"ambient",emoji:"🥖",items:[
["Багет французский","V-Market Bakery","1 шт",12900,false],["Хлеб зерновой","V-Market Bakery","450 г",14900,false],["Круассан сливочный","V-Market Bakery","1 шт",10900,false],["Лаваш тонкий","Local Premium","1 уп",9900,false],["Яйца С0","Local Premium","10 шт",22900,false],["Тостовый хлеб","Harry's","470 г",29900,false]]},
{category:"Бакалея",storage:"ambient",emoji:"🍝",items:[
["Barilla Spaghetti №5","Barilla","500 г",27900,false],["Barilla Penne","Barilla","500 г",28900,false],["Рис Basmati","Tilda","500 г",38900,false],["Овсяные хлопья","Nordic","500 г",34900,false],["Гречка premium","V-Market Select","800 г",25900,false],["Кускус","Mistral","450 г",32900,false]]},
{category:"Соусы и специи",storage:"ambient",emoji:"🌶️",items:[
["Heinz кетчуп","Heinz","320 г",24900,false],["Hellmann's майонез","Hellmann's","400 г",32900,false],["Tabasco Original","Tabasco","60 мл",39900,false],["Соевый соус","Kikkoman","150 мл",41900,false],["Морская соль","V-Market Select","250 г",11900,false],["Перец черный мельница","Kotanyi","36 г",24900,false]]},
{category:"Масло и консервы",storage:"ambient",emoji:"🫒",items:[
["Оливковое масло Extra Virgin","Borges","500 мл",78900,false],["Подсолнечное масло","Золотая Семечка","1 л",24900,false],["Тунец в собственном соку","Rio Mare","160 г",44900,false],["Оливки без косточек","Bonduelle","300 г",26900,false],["Кукуруза сладкая","Bonduelle","340 г",19900,false],["Фасоль красная","Bonduelle","400 г",21900,false]]},
{category:"Кофе и чай",storage:"ambient",emoji:"☕",items:[
["Nescafé Gold","Nescafé","95 г",54990,true],["Nescafé Gold Barista","Nescafé","85 г",54990,true],["Lavazza Qualità Oro","Lavazza","250 г",72900,false],["Illy Classico ground","Illy","250 г",119900,false],["Tess Berry","Tess","20 пак",13990,true],["Ahmad English Breakfast","Ahmad Tea","25 пак",28900,false]]},
{category:"Стирка",storage:"ambient",emoji:"🧺",items:[
["Persil Color Gel","Persil","1.3 л",79900,false],["Persil Power Powder","Persil","3 кг",119900,false],["Ariel Color Gel","Ariel","1.3 л",82900,false],["Lenor кондиционер","Lenor","930 мл",44900,false],["Vanish Oxi Action","Vanish","500 г",54900,false],["Finish All in 1","Finish","30 таб",99900,false]]},
{category:"Уборка",storage:"ambient",emoji:"🧽",items:[
["Fairy лимон","Fairy","450 мл",22900,false],["Cif Cream","Cif","500 мл",27900,false],["Domestos","Domestos","750 мл",28900,false],["Mr. Proper","Mr. Proper","1 л",26900,false],["Bref WC блок","Bref","2 шт",25900,false],["Glade Air Freshener","Glade","300 мл",34900,false]]},
{category:"Бумага и салфетки",storage:"ambient",emoji:"🧻",items:[
["Zewa Deluxe туалетная бумага","Zewa","4 рул",33900,false],["Papia туалетная бумага","Papia","4 рул",29900,false],["Kleenex салфетки","Kleenex","100 шт",24900,false],["Papia кухонные полотенца","Papia","2 рул",26900,false],["Влажные салфетки","Huggies","56 шт",27900,false],["Салфетки столовые premium","V-Market Select","100 шт",14900,false]]},
{category:"Зубная и базовая гигиена",storage:"ambient",emoji:"🪥",items:[
["Colgate Total","Colgate","75 мл",28900,false],["Sensodyne Repair","Sensodyne","75 мл",57900,false],["Oral-B Pro Expert щетка","Oral-B","1 шт",34900,false],["Listerine Cool Mint","Listerine","500 мл",49900,false],["Dove мыло","Dove","90 г",13900,false],["Dettol жидкое мыло","Dettol","250 мл",29900,false]]},
{category:"Волосы и тело",storage:"ambient",emoji:"🧴",items:[
["Elseve шампунь","L'Oréal Elseve","400 мл",52900,false],["Elseve бальзам","L'Oréal Elseve","400 мл",52900,false],["Dove гель для душа","Dove","500 мл",44900,false],["Nivea Men гель","Nivea","500 мл",47900,false],["Rexona дезодорант","Rexona","150 мл",32900,false],["Nivea крем","Nivea","150 мл",35900,false]]},
{category:"Travel essentials",storage:"ambient",emoji:"🧳",items:[
["Gillette Blue II","Gillette","5 шт",39900,false],["Gillette Fusion кассета","Gillette","2 шт",99900,false],["Always Ultra Normal","Always","10 шт",29900,false],["Kotex Ultra","Kotex","8 шт",26900,false],["Ватные диски","Bella","100 шт",15900,false],["Travel kit toothbrush + paste","V-Market","1 набор",24900,false]]}
];

function marketImageFor(category:string){
  const beverage="https://egjq873micunx4fu.public.blob.vercel-storage.com/uploads/1768807571040-fmcg-beverages.png";
  const dairy="https://uznews.uz/storage/uploads/68/0f/7d/file_680f7d444dbe8_orig.jpg";
  const snacks="https://www.gg-distributors.com/img/sn.png";
  const hygiene="https://farmaximalouveira.com/assets/category-higiene-BDRYijoz.jpg";
  const household="https://cdn.prod.website-files.com/6556a292d56eb873329f5c20/6556a292d56eb873329f5ca3_Santax-Household.jpg";
  const fresh="https://cdn.portfolio.hu/articles/images-md/k/o/r/kormany-birsag-kiskereskedelem-szabalyozas-elelmiszer-arresstop-740623.jpg";
  const pantry="https://images.ctfassets.net/prxuf37q3ta2/4xbggdu6sq4ghn1hZTu7n/ad9eaabc31e63e0704e47d048f97f074/Hacks-hero.jpg?fm=webp&w=1600";
  const coffee="https://images.squarespace-cdn.com/content/v1/638792a761fca6282c29c020/4cc4ee31-30d5-47da-bcf4-d111869e1e4b/2022-0809_pantry-launch_full-family_1x1_james-ransom_191%2Bcopy.jpg";
  const bakery="https://d3gykfqzdbmcsi.cloudfront.net/fileadmin/nova-gorica/store_photos/interspar.jpg";
  if(["Вода","Напитки","Соки и энергетики"].includes(category))return beverage;
  if(["Молочная продукция","Сыры и гастрономия"].includes(category))return dairy;
  if(["Снеки","Шоколад и сладости"].includes(category))return snacks;
  if(["Мясо и птица","Заморозка"].includes(category))return fresh;
  if(category==="Хлеб и яйца")return bakery;
  if(["Бакалея","Соусы и специи","Масло и консервы"].includes(category))return pantry;
  if(category==="Кофе и чай")return coffee;
  if(["Стирка","Уборка","Бумага и салфетки"].includes(category))return household;
  if(["Зубная и базовая гигиена","Волосы и тело","Travel essentials"].includes(category))return hygiene;
  return pantry;
}

export function buildMarketSeed():MarketProduct[]{
  let i=0;
  return blueprint.flatMap(group=>group.items.map(([name,brand,unit,cost,verified])=>{
    i+=1;
    return {
      id:"mkt-"+String(i).padStart(3,"0"),
      sku:"VM-"+String(i).padStart(4,"0"),
      nameRu:name,nameUz:name,nameEn:name,brand,category:group.category,unit,
      referenceCostUzs:cost,markupPercent:25,guestPriceUzs:priceWithMarkup(cost,25),
      priceStatus:verified?"verified_reference":"demo_reference",
      sourceLabel:verified?"Korzinka public catalogue reference":"Demo baseline — verify supplier cost",
      sourceDate:"2026-10-09",storage:group.storage,
      stock:10+((i*7)%21),reserved:0,reorderPoint:5+(i%4),emoji:group.emoji,imageUrl:marketImageFor(group.category),imageAlt:name+" — product photo"
    } satisfies MarketProduct;
  }));
}
export const marketSeed=buildMarketSeed();

export function addCartLine(cart:Cart,product:MarketProduct,delta:number):Cart{
  const current=cart[product.id]||0;
  const next=Math.max(0,Math.min(availableStock(product),current+delta));
  const copy={...cart};
  if(next===0)delete copy[product.id]; else copy[product.id]=next;
  return copy;
}
export function cartSummary(products:MarketProduct[],cart:Cart,deliveryFeeUzs=10000){
  const lines=products.flatMap(p=>{
    const q=cart[p.id]||0;if(!q)return [];
    return [{productId:p.id,sku:p.sku,name:p.nameRu,quantity:q,unitPriceUzs:p.guestPriceUzs,lineTotalUzs:p.guestPriceUzs*q}];
  });
  const subtotalUzs=lines.reduce((s,l)=>s+l.lineTotalUzs,0);
  return {lines,subtotalUzs,deliveryFeeUzs:lines.length?deliveryFeeUzs:0,totalUzs:subtotalUzs+(lines.length?deliveryFeeUzs:0)};
}
function entry(type:LedgerType,sku:string,quantity:number,now:string,orderId?:string,reason?:string):InventoryLedgerEntry{
  return {id:"LE-"+Math.random().toString(36).slice(2,10),createdAt:now,sku,type,quantity,orderId,reason};
}
export function placeDemoOrder(state:MarketState,cart:Cart,input:{
  idempotencyKey:string;apartment:string;deliverySlot:string;comment:string;payment:"demo_card"|"room_charge";paymentOutcome?:"success"|"failure";now?:string;orderId?:string;deliveryFeeUzs?:number
}){
  const existing=state.orders.find(o=>o.idempotencyKey===input.idempotencyKey);
  if(existing)return {state,order:existing,duplicate:true};
  if(input.payment==="demo_card"&&input.paymentOutcome==="failure")throw new Error("DEMO_PAYMENT_FAILED");
  const summary=cartSummary(state.products,cart,input.deliveryFeeUzs??10000);
  if(!summary.lines.length)throw new Error("EMPTY_CART");
  for(const line of summary.lines){
    const p=state.products.find(x=>x.id===line.productId);
    if(!p||availableStock(p)<line.quantity)throw new Error("OUT_OF_STOCK:"+line.sku);
  }
  const now=input.now||new Date().toISOString();
  const orderId=input.orderId||"VM-"+Date.now().toString().slice(-8);
  const products=state.products.map(p=>{
    const line=summary.lines.find(l=>l.productId===p.id);
    return line?{...p,reserved:p.reserved+line.quantity}:p;
  });
  const order:MarketOrder={id:orderId,idempotencyKey:input.idempotencyKey,createdAt:now,status:"new",apartment:input.apartment,deliverySlot:input.deliverySlot,comment:input.comment,
    paymentStatus:input.payment==="room_charge"?"room_charge":"demo_paid",subtotalUzs:summary.subtotalUzs,deliveryFeeUzs:summary.deliveryFeeUzs,totalUzs:summary.totalUzs,lines:summary.lines};
  const ledger=[...state.ledger,...order.lines.map(l=>entry("RESERVE",l.sku,l.quantity,now,order.id,"checkout reservation"))];
  return {state:{products,orders:[order,...state.orders],ledger},order,duplicate:false};
}
const nextStatus:Record<Exclude<MarketOrderStatus,"delivered"|"cancelled">,MarketOrderStatus>={new:"picking",picking:"packed",packed:"out_for_delivery",out_for_delivery:"delivered"};
export function advanceMarketOrder(state:MarketState,orderId:string,now=new Date().toISOString()):MarketState{
  const target=state.orders.find(o=>o.id===orderId);
  if(!target||target.status==="delivered"||target.status==="cancelled")return state;
  const status=nextStatus[target.status as keyof typeof nextStatus];
  let products=state.products; let ledger=state.ledger;
  if(status==="delivered"){
    products=state.products.map(p=>{
      const line=target.lines.find(l=>l.productId===p.id);
      if(!line)return p;
      return {...p,stock:Math.max(0,p.stock-line.quantity),reserved:Math.max(0,p.reserved-line.quantity)};
    });
    ledger=[...ledger,...target.lines.map(l=>entry("SALE",l.sku,-l.quantity,now,target.id,"delivered order"))];
  }
  return {...state,products,ledger,orders:state.orders.map(o=>o.id===orderId?{...o,status}:o)};
}
export function cancelMarketOrder(state:MarketState,orderId:string,now=new Date().toISOString()):MarketState{
  const target=state.orders.find(o=>o.id===orderId);
  if(!target||target.status==="delivered"||target.status==="cancelled")return state;
  const products=state.products.map(p=>{
    const line=target.lines.find(l=>l.productId===p.id);
    return line?{...p,reserved:Math.max(0,p.reserved-line.quantity)}:p;
  });
  const ledger=[...state.ledger,...target.lines.map(l=>entry("RELEASE",l.sku,l.quantity,now,target.id,"cancelled order"))];
  return {...state,products,ledger,orders:state.orders.map(o=>o.id===orderId?{...o,status:"cancelled"}:o)};
}
export function receiveMarketStock(state:MarketState,productId:string,quantity:number,reason="demo receiving",now=new Date().toISOString()):MarketState{
  if(quantity<=0)return state;
  const product=state.products.find(p=>p.id===productId);if(!product)return state;
  return {...state,products:state.products.map(p=>p.id===productId?{...p,stock:p.stock+quantity}:p),ledger:[...state.ledger,entry("RECEIVE",product.sku,quantity,now,undefined,reason)]};
}
export function adjustMarketStock(state:MarketState,productId:string,quantityDelta:number,reason:string,now=new Date().toISOString()):MarketState{
  const product=state.products.find(p=>p.id===productId);if(!product||!reason.trim())return state;
  const minDelta=-(product.stock-product.reserved);
  const safe=Math.max(minDelta,quantityDelta);
  if(safe===0)return state;
  return {...state,products:state.products.map(p=>p.id===productId?{...p,stock:p.stock+safe}:p),ledger:[...state.ledger,entry("ADJUSTMENT",product.sku,safe,now,undefined,reason)]};
}
export function marketAnalytics(state:MarketState){
  const delivered=state.orders.filter(o=>o.status==="delivered");
  const sales=delivered.reduce((s,o)=>s+o.totalUzs,0);
  return {orders:delivered.length,salesUzs:sales,aovUzs:delivered.length?Math.round(sales/delivered.length):0,lowStock:state.products.filter(p=>availableStock(p)<=p.reorderPoint).length};
}
