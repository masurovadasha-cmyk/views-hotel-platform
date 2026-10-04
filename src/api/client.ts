export type ApiErrorBody={error?:string;requestId?:string;detail?:string};
export class ApiError extends Error{
  constructor(public status:number,public body:ApiErrorBody){super(body.error||"API_ERROR")}
}
async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(path,{credentials:"include",...init,headers:{"Content-Type":"application/json",...(init?.headers||{})}});
  const body=await response.json().catch(()=>({})) as T&ApiErrorBody;
  if(!response.ok)throw new ApiError(response.status,body);
  return body;
}
export const api={
  session:()=>request<{authenticated:boolean;session?:unknown}>("/api/session"),
  requestLogin:(email:string)=>request<{status:string;expiresIn:number}>("/api/auth-email",{method:"POST",body:JSON.stringify({email})}),
  verifyLogin:(token:string)=>request<{authenticated:boolean;expiresAt:string}>("/api/auth-verify",{method:"POST",body:JSON.stringify({token})}),
  logout:()=>request<{ok:boolean}>("/api/logout",{method:"POST"}),
  bookings:()=>request<{items:import("./types").LiveBooking[]}>("/api/my-bookings"),
  serviceOrders:(propertyId="utower")=>request<{items:import("./types").LiveServiceOrder[]}>(`/api/service-orders?propertyId=${encodeURIComponent(propertyId)}`),
  createServiceOrder:(input:{propertyId:string;category:string;title:string;priority?:string},idempotencyKey:string)=>
    request<{id:string;status:string}>("/api/service-orders",{method:"POST",headers:{"Idempotency-Key":idempotencyKey},body:JSON.stringify(input)}),
  createGuestServiceOrder:(input:{reservationId:string;category:string;title:string;details:string},idempotencyKey:string)=>
    request<{id:string;status:string}>("/api/guest-service-orders",{method:"POST",headers:{"Idempotency-Key":idempotencyKey},body:JSON.stringify(input)}),
  serviceOrderAction:(input:{id:string;action:"accept"|"start"|"complete"|"cancel";version:number})=>
    request<{id:string;status:string;version:number}>("/api/service-order-action",{method:"POST",body:JSON.stringify(input)}),
  health:()=>request<{status:string}>("/api/health"),
  readiness:()=>request<{status:string;database:string}>("/api/readiness")
};
