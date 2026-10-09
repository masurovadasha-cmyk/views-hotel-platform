import {createServer} from "node:http";
import {randomUUID} from "node:crypto";
import {readFile} from "node:fs/promises";
import {priceWithMarkup,canTransition} from "./domain.mjs";
const port=Number(process.env.PORT||3100);
const orders=new Map(),keys=new Map();
const catalog=[{sku:"WATER-15",name:"Вода 1,5 л",priceUzs:priceWithMarkup(12000)},{sku:"MILK-1",name:"Молоко 1 л",priceUzs:priceWithMarkup(25600)},{sku:"CHOC-100",name:"Шоколад 100 г",priceUzs:priceWithMarkup(36000)},{sku:"CHEESE-200",name:"Сыр 200 г",priceUzs:priceWithMarkup(54400)}];
const send=(res,status,obj)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(obj))};
async function bodyOf(req){let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>32768)throw Error("Body too large")}return JSON.parse(raw)}
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,"http://localhost");
  if(url.pathname==="/"&&req.method==="GET"){const html=await readFile(new URL("../public/index.html",import.meta.url));res.writeHead(200,{"content-type":"text/html; charset=utf-8","cache-control":"no-store","content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'"});return res.end(html)}
  if(url.pathname==="/app.js"&&req.method==="GET"){const js=await readFile(new URL("../public/app.js",import.meta.url));res.writeHead(200,{"content-type":"text/javascript; charset=utf-8","cache-control":"no-store"});return res.end(js)}
  if(url.pathname==="/health"&&req.method==="GET")return send(res,200,{status:"ok",mode:"demo-memory"});
  if(url.pathname==="/api/v1/catalog"&&req.method==="GET")return send(res,200,catalog);
  if(url.pathname==="/api/v1/service-orders"&&req.method==="GET")return send(res,200,[...orders.values()]);
  if(url.pathname==="/api/v1/service-orders"&&req.method==="POST"){
   const key=req.headers["idempotency-key"];
   if(typeof key!=="string"||key.length<8||key.length>128)return send(res,400,{error:"Valid Idempotency-Key required"});
   const body=await bodyOf(req);
   if(!Array.isArray(body.items)||body.items.length===0||body.items.length>50||body.items.some(x=>typeof x.sku!=="string"||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>100))return send(res,422,{error:"Invalid items"});
   const unique=new Set(body.items.map(x=>x.sku));
   if(unique.size!==body.items.length||body.items.some(x=>!catalog.some(p=>p.sku===x.sku)))return send(res,422,{error:"Unknown or duplicate SKU"});
   const items=body.items.map(x=>{const p=catalog.find(y=>y.sku===x.sku);return {sku:p.sku,name:p.name,quantity:x.quantity,unitPriceUzs:p.priceUzs}});
   const fingerprint=JSON.stringify(items);
   if(keys.has(key)){const prev=keys.get(key);return prev.fingerprint===fingerprint?send(res,200,orders.get(prev.id)):send(res,409,{error:"Idempotency conflict"})}
   const totalUzs=items.reduce((sum,x)=>sum+x.quantity*x.unitPriceUzs,0)+15000;
   const order={id:randomUUID(),serviceType:"market",fulfillmentStatus:"draft",paymentStatus:"unpaid",items,totalUzs,deliveryFeeUzs:15000,createdAt:new Date().toISOString()};
   orders.set(order.id,order);keys.set(key,{id:order.id,fingerprint});return send(res,201,order);
  }
  const match=url.pathname.match(/^\/api\/v1\/service-orders\/([a-f0-9-]+)$/);
  if(match&&req.method==="GET")return orders.has(match[1])?send(res,200,orders.get(match[1])):send(res,404,{error:"Not found"});
  if(match&&req.method==="PATCH"){
   const order=orders.get(match[1]);if(!order)return send(res,404,{error:"Not found"});
   const body=await bodyOf(req);
   if(!canTransition(order.fulfillmentStatus,body.fulfillmentStatus))return send(res,409,{error:"Invalid transition"});
   order.fulfillmentStatus=body.fulfillmentStatus;return send(res,200,order);
  }
  return send(res,404,{error:"Not found"});
 }catch(e){return send(res,e instanceof SyntaxError?400:400,{error:"Invalid request"})}
});
if(process.env.NODE_ENV!=="test")server.listen(port,"127.0.0.1",()=>console.log("VIEWS local demo on http://127.0.0.1:"+port));
export {server};
