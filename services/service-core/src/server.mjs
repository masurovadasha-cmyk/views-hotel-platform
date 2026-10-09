import {createServer} from "node:http";
import {randomUUID} from "node:crypto";
import {allocateFefo,priceWithMarkup,canTransition} from "./domain.mjs";
const port=Number(process.env.PORT||3100);
const orders=new Map(),keys=new Map();
const send=(res,status,obj)=>{res.writeHead(status,{"content-type":"application/json; charset=utf-8","cache-control":"no-store"});res.end(JSON.stringify(obj))};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,"http://localhost");
 if(url.pathname==="/health"&&req.method==="GET")return send(res,200,{status:"ok",mode:"demo-memory"});
 if(url.pathname==="/api/v1/catalog"&&req.method==="GET")return send(res,200,[{sku:"WATER-15",name:"Вода 1,5 л",priceUzs:priceWithMarkup(12000),imageUrl:null},{sku:"MILK-1",name:"Молоко 1 л",priceUzs:priceWithMarkup(25600),imageUrl:null}]);
 if(url.pathname==="/api/v1/service-orders"&&req.method==="POST"){
  if(!req.headers["idempotency-key"])return send(res,400,{error:"Idempotency-Key required"});
  let raw="";for await(const chunk of req){raw+=chunk;if(raw.length>32768)return send(res,413,{error:"Body too large"})}
  let body;try{body=JSON.parse(raw)}catch{return send(res,400,{error:"Invalid JSON"})}
  if(!Array.isArray(body.items)||!body.items.length||body.items.some(x=>typeof x.sku!=="string"||!Number.isSafeInteger(x.quantity)||x.quantity<1))return send(res,422,{error:"Invalid items"});
  const key=String(req.headers["idempotency-key"]);const fingerprint=JSON.stringify(body);
  if(keys.has(key)){const existing=keys.get(key);return existing.fingerprint===fingerprint?send(res,200,orders.get(existing.id)):send(res,409,{error:"Idempotency conflict"})}
  const order={id:randomUUID(),serviceType:"market",fulfillmentStatus:"draft",paymentStatus:"unpaid",items:body.items,createdAt:new Date().toISOString()};
  orders.set(order.id,order);keys.set(key,{id:order.id,fingerprint});return send(res,201,order);
 }
 const match=url.pathname.match(/^\/api\/v1\/service-orders\/([a-f0-9-]+)$/);
 if(match&&req.method==="GET")return orders.has(match[1])?send(res,200,orders.get(match[1])):send(res,404,{error:"Not found"});
 return send(res,404,{error:"Not found"});
});
if(process.env.NODE_ENV!=="test")server.listen(port,()=>console.log("VIEWS demo API on "+port));
export {server};
