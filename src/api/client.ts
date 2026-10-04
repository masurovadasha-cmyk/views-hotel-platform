export type ApiErrorBody={error?:string;requestId?:string;detail?:string};

export class ApiError extends Error{
  constructor(public status:number,public body:ApiErrorBody){
    super(body.error||"API_ERROR");
  }
}

async function request<T>(path:string,init?:RequestInit):Promise<T>{
  const response=await fetch(path,{...init,headers:{"Content-Type":"application/json",...(init?.headers||{})}});
  const body=await response.json().catch(()=>({})) as T&ApiErrorBody;
  if(!response.ok)throw new ApiError(response.status,body);
  return body;
}

export const api={
  session:()=>request<{authenticated:boolean;session?:unknown}>("/api/session"),
  serviceOrders:(propertyId="utower")=>request<{items:unknown[]}>(`/api/service-orders?propertyId=${encodeURIComponent(propertyId)}`),
  createServiceOrder:(input:{propertyId:string;category:string;title:string;priority?:string},idempotencyKey:string)=>
    request<{id:string;status:string}>("/api/service-orders",{method:"POST",headers:{"Idempotency-Key":idempotencyKey},body:JSON.stringify(input)}),
  health:()=>request<{status:string}>("/api/health"),
  readiness:()=>request<{status:string;database:string}>("/api/readiness")
};
