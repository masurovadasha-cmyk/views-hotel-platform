export type CoreMarketOrder={id:string;property_id:string;unit_id:string|null;status:string;payment_status:string;total_minor:string;delivery_slot:string;version:number;created_at:string};
export async function fetchStaffMarketOrders(propertyId:string,signal?:AbortSignal):Promise<CoreMarketOrder[]>{
 if(!propertyId.trim())throw Error("PROPERTY_REQUIRED");
 const response=await fetch("/api/market-staff-orders?propertyId="+encodeURIComponent(propertyId)+"&limit=50",{credentials:"same-origin",signal,headers:{Accept:"application/json"}});
 if(!response.ok)throw Error(response.status===401?"STAFF_AUTH_REQUIRED":response.status===403?"PROPERTY_FORBIDDEN":"CORE_ORDERS_UNAVAILABLE");
 const body:unknown=await response.json();
 if(!body||typeof body!=="object"||!Array.isArray((body as {orders?:unknown}).orders))throw Error("CORE_INVALID_RESPONSE");
 return (body as {orders:CoreMarketOrder[]}).orders;
}
