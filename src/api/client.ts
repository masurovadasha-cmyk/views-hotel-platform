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
  requestLogin:(email:string)=>request<{status:string;expiresIn:number;token?:string}>("/api/auth-email",{method:"POST",body:JSON.stringify({email})}),
  verifyLogin:(token:string)=>request<{authenticated:boolean;expiresAt:string}>("/api/auth-verify",{method:"POST",body:JSON.stringify({token})}),
  logout:()=>request<{ok:boolean}>("/api/logout",{method:"POST"}),
  bookings:()=>request<{items:import("./types").LiveBooking[]}>("/api/my-bookings"),
  frontDeskReservations:(propertyId="utower")=>
    request<{propertyId:string;items:import("./types").LiveFrontDeskReservation[]}>(`/api/frontdesk-reservations?propertyId=${encodeURIComponent(propertyId)}`),
  frontDeskAction:(input:{id:string;action:"check_in"|"check_out";version:number})=>
    request<{id:string;status:string;version:number;unitStatus:string;housekeepingCreated:boolean}>("/api/frontdesk-action",{method:"POST",body:JSON.stringify(input)}),
  guest360:(guestId:string,propertyId="utower")=>
    request<{guest:import("./types").LiveGuestProfile;reservations:import("./types").LiveGuestReservation[];openServiceOrders:number}>(`/api/guest-360?propertyId=${encodeURIComponent(propertyId)}&guestId=${encodeURIComponent(guestId)}`),
  stayCard:(reservationId:string,propertyId="utower")=>
    request<{reservation:Record<string,unknown>;operations:{openServiceOrders:number;openMaintenance:number;latestHousekeeping:Record<string,unknown>|null}}>(`/api/stay-card?propertyId=${encodeURIComponent(propertyId)}&reservationId=${encodeURIComponent(reservationId)}`),
  propertyUnits:(propertyId="utower")=>
    request<{propertyId:string;items:import("./types").LivePropertyUnit[]}>(`/api/property-units?propertyId=${encodeURIComponent(propertyId)}`),
  serviceOrders:(propertyId="utower")=>request<{items:import("./types").LiveServiceOrder[]}>(`/api/service-orders?propertyId=${encodeURIComponent(propertyId)}`),
  createServiceOrder:(input:{propertyId:string;category:string;title:string;priority?:string},idempotencyKey:string)=>
    request<{id:string;status:string}>("/api/service-orders",{method:"POST",headers:{"Idempotency-Key":idempotencyKey},body:JSON.stringify(input)}),
  createGuestServiceOrder:(input:{reservationId:string;category:string;title:string;details:string},idempotencyKey:string)=>
    request<{id:string;status:string}>("/api/guest-service-orders",{method:"POST",headers:{"Idempotency-Key":idempotencyKey},body:JSON.stringify(input)}),
  serviceOrderAction:(input:{id:string;action:"accept"|"start"|"complete"|"cancel";version:number})=>
    request<{id:string;status:string;version:number}>("/api/service-order-action",{method:"POST",body:JSON.stringify(input)}),
  assignServiceOrder:(input:{id:string;assignedUserId:string;version:number})=>
    request<{id:string;status:string;version:number;assignedUserId:string;assigneeRole:string}>("/api/service-order-assign",{method:"POST",body:JSON.stringify(input)}),
  teamWorkload:(propertyId="utower")=>
    request<{propertyId:string;staff:import("./types").LiveStaffWorkload[];summary:import("./types").LiveTeamSummary}>(`/api/team-workload?propertyId=${encodeURIComponent(propertyId)}`),
  integrationsStatus:()=>request<{items:import("./types").LiveIntegrationStatus[]}>("/api/integrations-status"),
  housekeepingJobs:(propertyId="utower")=>
    request<{propertyId:string;items:import("./types").LiveHousekeepingJob[]}>(`/api/housekeeping-jobs?propertyId=${encodeURIComponent(propertyId)}`),
  housekeepingAction:(id:string,action:"start"|"complete"|"verify"|"dnd"|"decline")=>
    request<{id:string;status:string;assignedUserId?:string|null}>("/api/housekeeping-action",{method:"POST",body:JSON.stringify({id,action})}),
  maintenanceTickets:(propertyId="utower")=>
    request<{propertyId:string;items:import("./types").LiveMaintenanceTicket[]}>(`/api/maintenance-tickets?propertyId=${encodeURIComponent(propertyId)}`),
  maintenanceAction:(id:string,action:"start"|"wait"|"block"|"resolve"|"verify")=>
    request<{id:string;status:string;assignedUserId?:string|null}>("/api/maintenance-action",{method:"POST",body:JSON.stringify({id,action})}),
  health:()=>request<{status:string}>("/api/health"),
  operationsSummary:(propertyId="utower")=>request<{propertyId:string;lostFoundOpen:number;damageOpen:number;inventoryLow:number;serviceOrdersOpen:number}>(`/api/operations-summary?propertyId=${encodeURIComponent(propertyId)}`),
  operationsObservability:(propertyId="utower")=>
    request<import("./types").LiveOperationsObservability>(`/api/operations-observability?propertyId=${encodeURIComponent(propertyId)}`),
  processOutbox:(limit=25)=>request<{claimed:number;processed:number;retried:number;deadLettered:number;skippedClaim:number;remaining:number;failures:Array<{id:string;error:string;attempt:number}>}>("/api/outbox-process",{method:"POST",body:JSON.stringify({limit})}),
  retryOutbox:(id:string)=>request<{id:string;status:string}>("/api/outbox-retry",{method:"POST",body:JSON.stringify({id})}),
  operationsExceptions:(propertyId="utower")=>request<{propertyId:string;lostFound:import("./types").LiveLostFoundItem[];damage:import("./types").LiveDamageReport[];lowStock:import("./types").LiveInventoryItem[]}>(`/api/operations-exceptions?propertyId=${encodeURIComponent(propertyId)}`),
  handovers:(propertyId="utower")=>request<{propertyId:string;items:import("./types").LiveShiftHandover[]}>(`/api/shift-handover?propertyId=${encodeURIComponent(propertyId)}`),
  apartmentTimeline:(unitId:string)=>request<{unit:{id:string;propertyId:string;code:string;name:string;status:string};items:import("./types").LiveTimelineEvent[]}>(`/api/apartment-timeline?unitId=${encodeURIComponent(unitId)}`),
  lostFoundAction:(id:string,action:"claim"|"return"|"close")=>request<{id:string;status:string}>("/api/lost-found-action",{method:"POST",body:JSON.stringify({id,action})}),
  damageAction:(id:string,action:"review"|"resolve"|"close")=>request<{id:string;status:string}>("/api/damage-action",{method:"POST",body:JSON.stringify({id,action})}),
  inventoryAdjust:(id:string,delta:number,note="")=>request<{id:string;quantity:number}>("/api/inventory-adjust",{method:"POST",body:JSON.stringify({id,delta,note})}),
  createHandover:(input:{propertyId:string;fromShift:string;toShift:string;unresolved:unknown[];risks:unknown[];followUp:unknown[]})=>request<{id:string;status:string}>("/api/shift-handover",{method:"POST",body:JSON.stringify(input)}),
  acknowledgeHandover:(id:string)=>request<{id:string;status:string}>("/api/shift-handover",{method:"PATCH",body:JSON.stringify({id})}),
  readiness:()=>request<{status:string;database:string;schema:string}>("/api/readiness")
};
