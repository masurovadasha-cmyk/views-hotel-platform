import {PartnerApiError,uuid,type PartnerAssignmentsApi,type PartnerDispatchApi} from '../partner-assignments/model';
import {parseRecoveryScope} from '../local-core/booking-recovery';
export type PartnerSession={scope:string;csrf:string;expiresAt:string};
export function parsePartnerSession(raw:unknown):PartnerSession|null{
 if(!raw||typeof raw!=='object')throw Error('INVALID_SESSION');const r=raw as Record<string,unknown>;
 if(r.authenticated===false)return null;
 if(r.authenticated!==true||r.synthetic!==true||typeof r.sessionScope!=='string'||typeof r.csrf!=='string'||!r.csrf||r.csrf.length>512||typeof r.expiresAt!=='string'||!Number.isFinite(Date.parse(r.expiresAt))||Date.parse(r.expiresAt)<=Date.now())throw Error('INVALID_SESSION');
 const pair:unknown=JSON.parse(r.sessionScope);if(!Array.isArray(pair)||pair.length!==2||!pair.every(uuid))throw Error('INVALID_SESSION');
 return {scope:JSON.stringify(pair),csrf:r.csrf,expiresAt:r.expiresAt};
}
export function parseDispatchWorkspace(raw:unknown){
 if(!raw||typeof raw!=='object')throw Error('INVALID_SCOPE');const r=raw as Record<string,unknown>,scope=parseRecoveryScope(r.recoveryScope),property=r.property as {id?:unknown}|undefined;
 if(property?.id!==scope.propertyId||r.syntheticData!==true||r.realPayments!==false)throw Error('INVALID_SCOPE');
 return {scope:JSON.stringify([scope.organizationId,scope.userId,scope.membershipId]),propertyId:scope.propertyId};
}
export async function coordinationRequest(route:string,mode:'partner'|'staff',csrf?:string,body?:unknown,key?:string):Promise<unknown>{
 const headers:Record<string,string>=mode==='partner'?{'X-Views-Partner-Pilot':'1'}:{'X-Views-Local-Workspace':'1'};
 if(csrf)headers['X-CSRF-Token']=csrf;if(key)headers['Idempotency-Key']=key;if(body!==undefined)headers['Content-Type']='application/json';
 const response=await fetch((mode==='partner'?'/partner-api/':'/local-api/')+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const value=await response.json();if(!response.ok){if(response.status===401)window.dispatchEvent(new Event(mode==='partner'?'views-partner-expired':'views-staff-expired'));throw new PartnerApiError(typeof value?.error==='string'?value.error:'CORE_UNAVAILABLE',response.status);}return value;
}
export const partnerAdapter=(csrf:string):PartnerAssignmentsApi=>({list:after=>coordinationRequest('assignments'+(after?'?after='+encodeURIComponent(after):''),'partner'),decide:(id,body,key,recoveryOnly)=>coordinationRequest('assignments/'+encodeURIComponent(id)+'/decisions','partner',csrf,{...body,...recoveryOnly?{recoveryOnly:true}:{}},key)});
export const dispatchAdapter=(csrf:string):PartnerDispatchApi=>({list:(propertyId,after)=>coordinationRequest('partner-dispatch?'+new URLSearchParams({propertyId,...after?{after}:{}}),'staff',csrf),offer:(body,key,recoveryOnly)=>coordinationRequest('partner-dispatch/offers','staff',csrf,{...body,...recoveryOnly?{recoveryOnly:true}:{}},key)});
