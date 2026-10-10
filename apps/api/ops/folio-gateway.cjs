'use strict';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const DETAIL=/^\/local-api\/folios\/reservations\/[a-f0-9-]{36}(?:\/(charges|reversals))?$/i;
const route=p=>p==='/local-api/folios'||p==='/local-api/folios/properties'||p==='/local-api/night-audit'||DETAIL.test(p);
exports.validSearch=function(u,method){
 if(!route(u.pathname)||method!=='GET')return false;
 const allowed=u.pathname==='/local-api/night-audit'?['propertyId','businessDate']:u.pathname==='/local-api/folios'?['propertyId','cursor']:['cursor'];
 return [...u.searchParams.keys()].every(k=>allowed.includes(k)&&u.searchParams.getAll(k).length===1);
};
exports.handle=async function({u,req,res,identity,token,core,json,fail,readJson,exactKeys}){
 if(!route(u.pathname))return false;
 if(process.env.VIEWS_FOLIO_PILOT_ENABLED!=='true')fail(404,'FOLIO_DISABLED');
 const detail=DETAIL.exec(u.pathname),write=!!detail?.[1]||(u.pathname==='/local-api/night-audit'&&req.method==='POST');
 if(req.method!==(write?'POST':'GET'))fail(405,'METHOD_DENIED');
 if(!identity.permissions.includes('reservation.'+(write?'manage':'read')))fail(403,'STAFF_PERMISSION_DENIED');
 function scope(id){if(typeof id!=='string'||!UUID.test(id))fail(400,'INVALID_PROPERTY_ID');if(!identity.propertyIds.includes(id))fail(403,'PROPERTY_FORBIDDEN');}
 let body,key;
 if(write){
  key=req.headers['idempotency-key'];if(typeof key!=='string'||!UUID.test(key))fail(400,'IDEMPOTENCY_KEY_REQUIRED');
  body=await readJson(req);
  if(detail?.[1]==='charges')exactKeys(body,['kind','amountMinor','label']);
  else if(detail?.[1]==='reversals')exactKeys(body,['entryId','reason']);
  else{exactKeys(body,['propertyId','businessDate','expectedRevision']);scope(body.propertyId);}
 }else if(['/local-api/folios','/local-api/night-audit'].includes(u.pathname))scope(u.searchParams.get('propertyId'));
 const result=await core(u.pathname.replace('/local-api/','/v1/')+u.search,req.method,body,key,token,identity);
 json(res,200,result);return true;
};
