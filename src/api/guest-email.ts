import type {Locale} from '../i18n/messages';
import type {GuestEmailLink} from '../features/guest-auth/guest-email-link';
export type GuestProfile={userId:string;email:string;locale:Locale;expiresAt:string;role:'guest'};
export type GuestSession={authenticated:false}|{authenticated:true;profile:GuestProfile;csrf:string};
export class GuestEmailError extends Error{
 constructor(public code:string,public retryAfterSeconds=0){super(code);}
}
export async function guestEmailRequest(route:string,body?:object,csrf?:string,key?:string):Promise<Record<string,unknown>>{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
 try{
  const r=await fetch('/guest-api/'+route,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',redirect:'error',
   headers:{'Content-Type':'application/json','X-Views-Guest-Pilot':'1',...(csrf?{'X-Views-Guest-Csrf':csrf}:{}),...(key?{'Idempotency-Key':key}:{})},
   body:body===undefined?undefined:JSON.stringify(body),signal:controller.signal});
  const value:unknown=await r.json();
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_RESPONSE');
  const b=value as Record<string,unknown>;
  if(!r.ok)throw new GuestEmailError(typeof b.error==='string'?b.error:'GUEST_CORE_UNAVAILABLE',
   typeof b.retryAfterSeconds==='number'?b.retryAfterSeconds:0);
  return b;
 }catch(error){if(error instanceof GuestEmailError)throw error;throw new GuestEmailError('GUEST_CORE_UNAVAILABLE');}finally{clearTimeout(timer);}
}
export const guestEmail={
 async session():Promise<GuestSession>{
  const b=await guestEmailRequest('session');if(b.authenticated===false)return {authenticated:false};
  const p=b.profile as Partial<GuestProfile>|undefined;
  if(b.authenticated!==true||typeof b.csrf!=='string'||!/^[a-f0-9]{64}$/.test(b.csrf)||!p||p.role!=='guest'
   ||typeof p.userId!=='string'||typeof p.email!=='string'||!['ru','uz','en'].includes(p.locale||'')
   ||typeof p.expiresAt!=='string'||!Number.isFinite(Date.parse(p.expiresAt)))throw new GuestEmailError('GUEST_CORE_UNAVAILABLE');
  return {authenticated:true,profile:p as GuestProfile,csrf:b.csrf};
 },
 async request(email:string,locale:Locale){
  const b=await guestEmailRequest('request',{email,locale});
  if(b.status!=='provider_accepted'||b.resendAfterSeconds!==60)throw new GuestEmailError('GUEST_CORE_UNAVAILABLE');
  return {resendAfterSeconds:60};
 },
 async exchange(link:GuestEmailLink){const b=await guestEmailRequest('exchange',link);if(b.ok!==true)throw new GuestEmailError('GUEST_CORE_UNAVAILABLE');},
 async logout(csrf:string){const b=await guestEmailRequest('logout',{},csrf);if(b.ok!==true)throw new GuestEmailError('GUEST_CORE_UNAVAILABLE');}
};
