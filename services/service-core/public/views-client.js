/**
 * Shared authenticated API client for VIEWS CRM.
 * The token comes from an authenticated session provider, never from a hardcoded
 * value in source code. Do not persist credentials in localStorage.
 */
export function createViewsClient({baseUrl="",getToken}){
 if(typeof getToken!=="function")throw Error("getToken is required");
 async function request(path,{method="GET",body,idempotencyKey}={}){
  const token=await getToken();
  if(typeof token!=="string"||!token)throw Error("Sign-in required");
  const headers={Authorization:"Bearer "+token};
  if(body!==undefined)headers["content-type"]="application/json";
  if(idempotencyKey)headers["Idempotency-Key"]=idempotencyKey;
  const response=await fetch(baseUrl+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:"omit",cache:"no-store"});
  let payload;try{payload=await response.json()}catch{payload={error:"Unexpected response"}}
  if(!response.ok)throw Object.assign(Error(payload.error||"Request failed"),{status:response.status});
  return payload;
 }
 return {
  listCatalog:()=>request("/api/v1/market/catalog"),
  listBookings:()=>request("/api/v1/me/bookings"),
  createGuestOrder:(bookingId,items,key)=>request("/api/v1/service-orders",{method:"POST",body:{bookingId,items},idempotencyKey:key}),
  listOrders:()=>request("/api/v1/service-orders"),
  getOrder:id=>request("/api/v1/service-orders/"+encodeURIComponent(id)),
  changeStatus:(id,fulfillmentStatus)=>request("/api/v1/service-orders/"+encodeURIComponent(id),{method:"PATCH",body:{fulfillmentStatus}}),
  createOrder:(propertyId,items,key)=>request("/api/v1/service-orders",{method:"POST",body:{propertyId,items},idempotencyKey:key})
 };
}
