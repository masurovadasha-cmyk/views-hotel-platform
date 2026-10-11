'use strict';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const known=p=>['properties','items','orders','stock','movements','stock/issue','stocktake/preview','stocktake/confirm'].some(s=>p==='/local-api/supply/'+s)||/^\/local-api\/supply\/orders\/[a-f0-9-]{36}\/receive$/i.test(p);
exports.validSearch=function(u,method){if(!known(u.pathname)||method!=='GET')return false;const keys=u.pathname.endsWith('/properties')?['cursor']:['propertyId','cursor'];return [...u.searchParams.keys()].every(k=>keys.includes(k)&&u.searchParams.getAll(k).length===1);};
exports.handle=async function({u,req,res,identity,token,core,json,fail,readJson,exactKeys}){
 if(!known(u.pathname))return false;
 if(process.env.VIEWS_SUPPLY_PILOT_ENABLED!=='true')fail(404,'SUPPLY_DISABLED');
 const part=u.pathname.slice('/local-api/supply/'.length),receive=part.endsWith('/receive'),issue=part==='stock/issue',count=part.startsWith('stocktake/'),preview=part==='stocktake/preview',write=req.method==='POST';
 if(!['GET','POST'].includes(req.method)||(write&&!['items','orders'].includes(part)&&!receive&&!issue&&!count)||(!write&&(receive||issue||count)))fail(405,'METHOD_DENIED');
 if(!identity.permissions.includes(write?(receive||issue||count?'stock.manage':'purchase.manage'):'supply.read'))fail(403,'STAFF_PERMISSION_DENIED');
 function scope(id){if(typeof id!=='string'||!UUID.test(id))fail(400,'SUPPLY_INPUT_INVALID');if(!identity.propertyIds.includes(id))fail(403,'PROPERTY_FORBIDDEN');}
 let body,key;
 if(write){
  key=req.headers['idempotency-key'];if(!preview&&(typeof key!=='string'||!UUID.test(key)))fail(400,'IDEMPOTENCY_KEY_REQUIRED');body=await readJson(req,16384);if(!body||typeof body!=='object'||Array.isArray(body))fail(400,'INVALID_REQUEST');
  exactKeys(body,receive?(Object.keys(body).length?['lines']:[]):count?(preview?['propertyId','itemId','countedQuantity','reason']:['propertyId','itemId','countedQuantity','reason','expectedQuantity','expectedRevision']):issue?['propertyId','itemId','quantity','reference']:part==='items'?['propertyId','sku','name','unit']:['propertyId','reference','lines']);
  if(!receive)scope(body.propertyId);
 }else if(part!=='properties')scope(u.searchParams.get('propertyId'));
 json(res,200,await core(u.pathname.replace('/local-api/','/v1/')+u.search,req.method,body,key,token,identity));return true;
};
