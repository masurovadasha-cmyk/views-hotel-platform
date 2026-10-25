'use strict';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const queueSearch=(u,method)=>method==='GET'&&u.pathname==='/local-api/service-orders/queue'&&[...u.searchParams.keys()].every(k=>u.searchParams.getAll(k).length===1&&(k==='kind'&&['cleaning','laundry','market','concierge'].includes(u.searchParams.get(k))||k==='cursor'&&UUID.test(u.searchParams.get(k))))&&(!u.searchParams.has('cursor')||u.searchParams.has('kind'));
exports.validSearch=(u,method)=>queueSearch(u,method)||method==='GET'&&u.pathname==='/local-api/service-orders/concierge/knowledge'&&[...u.searchParams.keys()].every(k=>u.searchParams.getAll(k).length===1&&(k==='cursor'&&UUID.test(u.searchParams.get(k))||k==='search'&&u.searchParams.get(k).length<=80&&!/[\u0000-\u001f\u007f]/.test(u.searchParams.get(k))))||method==='GET'&&['/local-api/service-orders','/local-api/service-orders/laundry','/local-api/service-orders/concierge','/local-api/service-orders/concierge/overdue','/local-api/service-orders/market','/local-api/service-orders/market/catalog','/local-api/service-orders/market/finance'].includes(u.pathname)&&[...u.searchParams.keys()].every(k=>k==='cursor'&&u.searchParams.getAll(k).length===1&&UUID.test(u.searchParams.get(k)));
exports.handle=async({u,req,res,identity,token,core,json,fail,readJson,propertyId})=>{
 if(u.pathname==='/local-api/service-orders/queue'){
  if(process.env.VIEWS_SERVICE_ORDER_PILOT_ENABLED!=='true')fail(404,'SERVICE_ORDERS_DISABLED');
  if(req.method!=='GET')fail(405,'METHOD_DENIED');
  if(!queueSearch(u,req.method))fail(400,'INVALID_QUERY');
  if(!identity.permissions.some(p=>['reservation.manage','housekeeping.work','stock.manage','concierge.work'].includes(p)))fail(403,'STAFF_PERMISSION_DENIED');
  if(!identity.propertyIds.includes(propertyId))fail(403,'PROPERTY_FORBIDDEN');
  const query=new URLSearchParams(u.search);query.set('propertyId',propertyId);
  json(res,200,await core('/v1/service-orders/queue?'+query.toString(),'GET',undefined,undefined,token,identity));return true;
 }
 if(!/^\/local-api\/service-orders(?:\/concierge(?:\/knowledge|\/overdue|\/[a-f0-9-]{36}\/(?:actions|profile))?|\/market(?:\/catalog|\/finance|\/[a-f0-9-]{36}\/(?:actions|credits))?|\/laundry(?:\/[a-f0-9-]{36}\/actions)?|\/assignees|\/[a-f0-9-]{36}\/actions)?$/i.test(u.pathname))return false;
 if(process.env.VIEWS_SERVICE_ORDER_PILOT_ENABLED!=='true')fail(404,'SERVICE_ORDERS_DISABLED');
 if(u.pathname.includes('/laundry')&&!identity.permissions.includes('reservation.manage'))fail(403,'STAFF_PERMISSION_DENIED');
 if(u.pathname.includes('/market')&&process.env.VIEWS_MARKET_PILOT_ENABLED!=='true')fail(404,'SERVICE_MARKET_DISABLED');
 if(u.pathname.endsWith('/concierge/knowledge')&&req.method==='POST'&&!identity.permissions.includes('reservation.manage'))fail(403,'STAFF_PERMISSION_DENIED');
 const financePermission=u.pathname.endsWith('/finance')?'finance.read':u.pathname.endsWith('/credits')?'finance.manage':null;
 if(u.pathname.includes('/concierge')?!identity.permissions.some(p=>['reservation.manage','concierge.work'].includes(p)):u.pathname.includes('/market')?!identity.permissions.includes(financePermission||'stock.manage'):!identity.permissions.some(p=>['reservation.manage','housekeeping.work'].includes(p)))fail(403,'STAFF_PERMISSION_DENIED');
 if(!identity.propertyIds.includes(propertyId))fail(403,'PROPERTY_FORBIDDEN');
 let route=u.pathname.replace('/local-api/','/v1/'),body,key;
 if(route.endsWith('/actions')||route.endsWith('/credits')||route.endsWith('/concierge/knowledge')&&req.method==='POST'){
  if(req.method!=='POST')fail(405,'METHOD_DENIED');
  key=req.headers['idempotency-key'];if(typeof key!=='string'||!UUID.test(key))fail(400,'IDEMPOTENCY_KEY_REQUIRED');
  if(route.endsWith('/concierge/knowledge'))route+='?propertyId='+propertyId;
  body=await readJson(req); // Core enforces the exact action-specific schema.
 }else{
  if(req.method!=='GET')fail(405,'METHOD_DENIED');
  if(!route.endsWith('/profile'))route+='?propertyId='+propertyId+(u.searchParams.has('cursor')?'&cursor='+u.searchParams.get('cursor'):'')+(u.searchParams.has('search')?'&search='+encodeURIComponent(u.searchParams.get('search')):'');
 }
 json(res,200,await core(route,req.method,body,key,token,identity));return true;
};
