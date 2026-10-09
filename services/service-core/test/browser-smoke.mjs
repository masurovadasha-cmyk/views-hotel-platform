import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";
import {chromium} from "playwright";

const publicDir=resolve(fileURLToPath(new URL("../public/",import.meta.url)));
const screenshotDir=resolve(fileURLToPath(new URL("../browser-screenshots/",import.meta.url)));
const orderId="11111111-1111-4111-8111-111111111111";
const propertyId="22222222-2222-4222-8222-222222222222";
const bookingId="33333333-3333-4333-8333-333333333333";
const taskId="44444444-4444-4444-8444-444444444444";
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"};
const server=createServer(async(req,res)=>{
 const path=new URL(req.url,"http://localhost").pathname;
 const staticPath=({"/guest":"/guest.html","/crm":"/crm.html","/staff":"/staff.html","/finance":"/finance.html"})[path]||path;
 const file=resolve(publicDir,"."+staticPath);
 if(!file.startsWith(publicDir+sep)){res.writeHead(403);return res.end()}
 try{const data=await readFile(file);res.writeHead(200,{"content-type":mime[extname(file)]||"application/octet-stream","content-security-policy":"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'"});res.end(data)}
 catch{res.writeHead(404);res.end("Not found")}
});
const listen=()=>new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const close=()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
let browser;
const failures=[];
async function run(name,fn){try{await fn();console.log("PASS",name)}catch(e){failures.push(name+": "+e.message);console.error("FAIL",name,e)}}
try{
 await mkdir(screenshotDir,{recursive:true});
 await listen();
 const origin="http://127.0.0.1:"+server.address().port;
 browser=await chromium.launch({headless:true});
 async function pageFor(path,api){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/api/v1/**",async route=>{
   const request=route.request(),url=new URL(request.url()),key=request.method()+" "+url.pathname;
   if(request.headers().authorization!=="Bearer test-only-token")return route.fulfill({status:401,json:{error:"Unauthorized"}});
   const response=api[key]||{status:404,json:{error:"Not found"}};
   await route.fulfill({status:response.status||200,json:response.json});
  });
  await page.goto(origin+path);
  await page.locator("#token").fill("test-only-token");
  return {context,page,errors};
 }
 await run("guest: catalog, booking, cart and order total",async()=>{
  const {context,page,errors}=await pageFor("/guest",{
   "GET /api/v1/market/catalog":{json:[{sku:"WATER-15",name:"Вода 1,5 л",priceUzs:15000}]},
   "GET /api/v1/me/bookings":{json:[{id:bookingId,property_id:propertyId,ends_at:"2026-12-10T12:00:00Z"}]},
   "POST /api/v1/service-orders":{status:201,json:{id:orderId}},
   ["GET /api/v1/service-orders/"+orderId]:{json:{id:orderId,fulfillment_status:"draft",payment_status:"unpaid",total_uzs:30000}}
  });
  try{
   await page.getByRole("button",{name:"Загрузить мои бронирования"}).click();
   await page.getByRole("button",{name:"Загрузить каталог"}).click();
   await page.getByRole("button",{name:"Увеличить количество: Вода 1,5 л"}).click();
   await page.getByRole("button",{name:"Создать тестовый заказ"}).click();
   await page.getByText("Сумма заказа: 30").waitFor();
   assert.equal(await page.getByRole("button",{name:"Обновить статус"}).isEnabled(),true);
   assert.deepEqual(errors,[]);
   await page.screenshot({path:resolve(screenshotDir,"guest.png"),fullPage:true});
  }finally{await context.close()}
 });
 await run("guest: successful checkout stays locked when status lookup fails",async()=>{
  const {context,page,errors}=await pageFor("/guest",{
   "GET /api/v1/market/catalog":{json:[{sku:"WATER-15",name:"Вода 1,5 л",priceUzs:15000}]},
   "GET /api/v1/me/bookings":{json:[{id:bookingId,property_id:propertyId,ends_at:"2026-12-10T12:00:00Z"}]},
   "POST /api/v1/service-orders":{status:201,json:{id:orderId}},
   ["GET /api/v1/service-orders/"+orderId]:{status:503,json:{error:"Temporarily unavailable"}}
  });
  try{
   let creates=0;
   page.on("request",req=>{if(req.method()==="POST"&&new URL(req.url()).pathname==="/api/v1/service-orders")creates++});
   await page.getByRole("button",{name:"Загрузить мои бронирования"}).click();
   await page.getByRole("button",{name:"Загрузить каталог"}).click();
   await page.getByRole("button",{name:"Увеличить количество: Вода 1,5 л"}).click();
   await page.getByRole("button",{name:"Создать тестовый заказ"}).click();
   await page.getByText("Заказ создан. Статус временно недоступен").waitFor();
   assert.equal(await page.locator("#checkout").isDisabled(),true);
   assert.equal(await page.locator("#load-catalog").isDisabled(),true);
   assert.equal(await page.locator("#booking").isDisabled(),true);
   assert.equal(creates,1);
   assert.deepEqual(errors,[]);
  }finally{await context.close()}
 });
 await run("guest: retry uncertain order with same idempotency key",async()=>{
  const {context,page,errors}=await pageFor("/guest",{
   "GET /api/v1/market/catalog":{json:[{sku:"WATER-15",name:"Вода 1,5 л",priceUzs:15000}]},
   "GET /api/v1/me/bookings":{json:[{id:bookingId,property_id:propertyId,ends_at:"2026-12-10T12:00:00Z"}]},
   "POST /api/v1/service-orders":{status:503,json:{error:"Temporary failure"}}
  });
  const keys=[];
  try{
   page.on("request",req=>{if(req.method()==="POST"&&new URL(req.url()).pathname==="/api/v1/service-orders")keys.push(req.headers()["idempotency-key"])});
   await page.getByRole("button",{name:"Загрузить мои бронирования"}).click();
   await page.getByRole("button",{name:"Загрузить каталог"}).click();
   await page.getByRole("button",{name:"Увеличить количество: Вода 1,5 л"}).click();
   await page.getByRole("button",{name:"Создать тестовый заказ"}).click();
   await page.getByText("Ошибка создания:").waitFor();
   assert.equal(await page.locator("#load-catalog").isDisabled(),true);
   await page.getByRole("button",{name:"Создать тестовый заказ"}).click();
   await page.getByText("Ошибка создания:").waitFor();
   assert.equal(keys.length,2);
   assert.ok(keys[0]&&keys[0]===keys[1]);
   assert.deepEqual(errors,[]);
  }finally{await context.close()}
 });
 await run("guest: recover existing order after fresh page load",async()=>{
  const {context,page,errors}=await pageFor("/guest",{
   "GET /api/v1/me/orders":{json:[{id:orderId,fulfillment_status:"confirmed",total_uzs:45000}]},
   ["GET /api/v1/service-orders/"+orderId]:{json:{id:orderId,fulfillment_status:"confirmed",payment_status:"unpaid",total_uzs:45000}},
   ["GET /api/v1/me/orders/"+orderId+"/timeline"]:{json:[{id:"event-1",type:"market.order.created",at:"2026-10-10T10:00:00Z"},{id:"event-2",type:"service.task.assigned",taskKind:"market_deliver",at:"2026-10-10T10:05:00Z"}]}
  });
  try{
   await page.getByRole("button",{name:"Показать историю заказов"}).click();
   await page.locator("#order-history button").first().click();
   await page.getByText("Сумма заказа: 45").waitFor();
   await page.getByText("Назначен исполнитель · market_deliver").waitFor();
   assert.equal(await page.locator("#checkout").isDisabled(),true);
   assert.equal(await page.locator("#token").isDisabled(),true);
   assert.deepEqual(errors,[]);
  }finally{await context.close()}
 });
 await run("guest: inbox loads and marks notification read",async()=>{
  const notificationId="55555555-5555-4555-8555-555555555555";
  const {context,page,errors}=await pageFor("/guest",{
   "GET /api/v1/me/notifications":{json:[{id:notificationId,order_id:orderId,message:"Назначена доставка",occurred_at:"2026-10-10T10:00:00Z",read_at:null}]},
   ["POST /api/v1/me/notifications/"+notificationId+"/read"]:{json:{id:notificationId,read_at:"2026-10-10T10:10:00Z"}}
  });
  try{
   await page.getByRole("button",{name:"Обновить уведомления"}).click();
   await page.getByText("Назначена доставка",{exact:false}).waitFor();
   await page.getByRole("button",{name:"Прочитано"}).click();
   assert.deepEqual(errors,[]);
  }finally{await context.close()}
 });
 await run("CRM: authorized orders, SLA and details",async()=>{
  const {context,page,errors}=await pageFor("/crm",{
   "GET /api/v1/service-orders":{json:[{id:orderId,fulfillment_status:"confirmed"}]},
   "GET /api/v1/dispatch/sla":{json:{total:1,open:1,overdue:0,completed:0}},
   ["GET /api/v1/service-orders/"+orderId]:{json:{id:orderId,property_id:propertyId,service_type:"market",fulfillment_status:"confirmed",payment_status:"unpaid"}}
  });
  try{
   await page.getByRole("button",{name:"Подключиться"}).click();
   await page.getByText("Всего: 1").waitFor();
   await page.locator("#orders button").first().click();
   await page.getByText("Статус: Подтверждён").waitFor();
   assert.deepEqual(errors,[]);
   await page.screenshot({path:resolve(screenshotDir,"crm.png"),fullPage:true});
  }finally{await context.close()}
 });
 await run("staff: task lifecycle",async()=>{
  const {context,page,errors}=await pageFor("/staff",{
   "GET /api/v1/staff/tasks":{json:[{id:taskId,order_id:orderId,property_id:propertyId,task_kind:"market_pick",status:"assigned"}]},
   ["PATCH /api/v1/staff/tasks/"+taskId]:{json:{id:taskId,status:"in_progress"}}
  });
  try{
   await page.getByRole("button",{name:"Открыть мои задания"}).click();
   await page.getByText("Собрать товары").waitFor();
   assert.equal(await page.getByRole("button",{name:"Начать"}).isVisible(),true);
   assert.deepEqual(errors,[]);
   await page.screenshot({path:resolve(screenshotDir,"staff.png"),fullPage:true});
  }finally{await context.close()}
 });
 await run("staff: cleaning checklist remains open after confirming an item",async()=>{
  const {context,page,errors}=await pageFor("/staff",{
   "GET /api/v1/staff/tasks":{json:[{id:taskId,order_id:orderId,property_id:propertyId,task_kind:"cleaning",status:"in_progress"}]}
  });
  let completed=false;
  try{
   await page.route("**/api/v1/staff/tasks/"+taskId+"/checklist",route=>route.fulfill({status:200,json:[{item_code:"bathroom",label:"Ванная",completed_at:completed?"2026-10-10T10:00:00Z":null,completed_by:completed?"cleaner":null}]}));
   await page.route("**/api/v1/cleaning/items/complete",route=>{completed=true;return route.fulfill({status:200,json:{taskId,itemCode:"bathroom",completed:true}})});
   await page.getByRole("button",{name:"Открыть мои задания"}).click();
   await page.getByRole("button",{name:"Открыть чек-лист"}).click();
   await page.getByRole("button",{name:"Выполнено: Ванная"}).click();
   await page.getByRole("button",{name:"Завершить уборку"}).waitFor();
   assert.equal(completed,true);
   assert.deepEqual(errors,[]);
  }finally{await context.close()}
 });
 await run("finance: read-only payments and refunds",async()=>{
  const {context,page,errors}=await pageFor("/finance",{
   "GET /api/v1/finance/payments":{json:[{order_id:orderId,provider:"sandbox",amount_uzs:45000,status:"created"}]},
   "GET /api/v1/finance/refunds":{json:[]}
  });
  try{
   await page.getByRole("button",{name:"Загрузить"}).click();
   await page.getByText("Данные загружены").waitFor();
   await page.getByText("Нет записей").waitFor();
   assert.deepEqual(errors,[]);
   await page.screenshot({path:resolve(screenshotDir,"finance.png"),fullPage:true});
  }finally{await context.close()}
 });
 await run("responsive: no horizontal overflow on mobile, tablet and desktop",async()=>{
  for(const route of ["/guest","/crm","/staff","/finance"]){
   const {context,page,errors}=await pageFor(route,{});
   try{
    for(const width of [320,390,768,1280]){
     await page.setViewportSize({width,height:900});
     const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,viewport:window.innerWidth}));
     assert.ok(dims.scroll<=dims.viewport+1,route+" at "+width+"px overflows by "+(dims.scroll-dims.viewport)+"px");
     if(width===1280)await page.screenshot({path:resolve(screenshotDir,route.slice(1)+"-desktop.png"),fullPage:true});
    }
    assert.deepEqual(errors,[]);
   }finally{await context.close()}
  }
 });
}finally{
 if(browser)await browser.close();
 await close();
}
if(failures.length){for(const failure of failures)console.error(failure);process.exitCode=1}
