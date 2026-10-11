'use strict';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
exports.validSearch=(u,method)=>method==='GET'&&['/local-api/service-orders','/local-api/service-orders/laundry','/local-api/service-orders/market'].includes(u.pathname)&&[...u.searchParams.keys()].every(k=>k==='cursor'&&u.searchParams.getAll(k).length===1&&UUID.test(u.searchParams.get(k)));
exports.handle=async({u,req,res,identity,token,core,json,fail,readJson,propertyId})=>{
 if(!/^\/local-api\/service-orders(?:\/market(?:\/[a-f0-9-]{36}\/actions)?|\/laundry(?:\/[a-f0-9-]{36}\/actions)?|\/assignees|\/[a-f0-9-]{36}\/actions)?$/i.test(u.pathname))return false;
 if(process.env.VIEWS_SERVICE_ORDER_PILOT_ENABLED!=='true')fail(404,'SERVICE_ORDERS_DISABLED');
 if(u.pathname.includes('/laundry')&&!identity.permissions.includes('reservation.manage'))fail(403,'STAFF_PERMISSION_DENIED');
 if(u.pathname.includes('/market')&&process.env.VIEWS_MARKET_PILOT_ENABLED!=='true')fail(404,'SERVICE_MARKET_DISABLED');
 if(u.pathname.includes('/market')?!identity.permissions.includes('stock.manage'):!identity.permissions.some(p=>['reservation.manage','housekeeping.work'].includes(p)))fail(403,'STAFF_PERMISSION_DENIED');
 if(!identity.propertyIds.includes(propertyId))fail(403,'PROPERTY_FORBIDDEN');
 let route=u.pathname.replace('/local-api/','/v1/'),body,key;
 if(route.endsWith('/actions')){
  if(req.method!=='POST')fail(405,'METHOD_DENIED');
  key=req.headers['idempotency-key'];if(typeof key!=='string'||!UUID.test(key))fail(400,'IDEMPOTENCY_KEY_REQUIRED');
  body=await readJson(req); // Core enforces the exact action-specific schema.
 }else{
  if(req.method!=='GET')fail(405,'METHOD_DENIED');
  route+='?propertyId='+propertyId+(u.searchParams.has('cursor')?'&cursor='+u.searchParams.get('cursor'):'');
 }
 json(res,200,await core(route,req.method,body,key,token,identity));return true;
};
