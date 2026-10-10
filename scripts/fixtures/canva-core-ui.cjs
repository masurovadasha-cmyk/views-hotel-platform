'use strict';
// Synthetic READ responses for visual acceptance. Never credentials, writes or a real database.
const id='11111111-1111-4111-8111-111111111111',itemId='22222222-2222-4222-8222-222222222222';
const property={id,name:{ru:'Тестовый объект · длинное название',uz:'Sinov obyekti · uzun nom',en:'Synthetic property · long name'},timezone:'Asia/Tashkent'};
const trip={id,confirmationCode:'SYNTHETIC-CANVA',status:'confirmed',checkInAt:'2037-06-10T10:00:00Z',checkOutAt:'2037-06-12T07:00:00Z',currency:'UZS',totalMinor:'9007199254740993',property:{...property,city:'Tashkent'}};
const permissions={front_desk:['reservation.manage','reservation.read'],housekeeper:['housekeeping.work'],technician:[],concierge:[],accountant:['reservation.read','finance.read'],manager:['property.manage','reservation.manage','reservation.read','finance.read'],owner:['property.manage','reservation.read','finance.read'],procurement:['supply.read','purchase.manage'],warehouse:['supply.read','stock.manage']};
function response(path,state){
 if(path==='/local-api/session')return state.staff==='signed-out'?{authenticated:false}:{authenticated:true,csrf:'synthetic',identity:{role:state.staff,permissions:permissions[state.staff],email:'staff@views.invalid',displayName:'Synthetic employee',emailVerified:false,expiresAt:'2037-01-01T00:00:00Z'}};
 if(path==='/local-api/owner-inventory')return {properties:[],truncated:false,draftOnly:true};
 if(path==='/local-api/refund-reconciliation')return {items:[],nextCursor:null};
 if(path==='/local-api/housekeeping')return {items:[{taskId:id,unitCode:'TEST-101',createdAt:'2026-10-01T10:00:00Z',assignment:'mine'}],truncated:false,syntheticData:true};
 if(path==='/local-api/workspace')return {property,units:[],reservations:[],reservationsTruncated:false,databaseTime:'2026-10-10T10:00:00Z',syntheticData:true,realPayments:false};
 if(path==='/local-api/reception'){const group={total:0,truncated:false,items:[]};return {property,day:'2026-10-10',databaseTime:'2026-10-10T10:00:00Z',arrivals:group,departures:group,staying:group,cleaning:group};}
 if(['/local-api/supply/properties','/local-api/folios/properties'].includes(path))return {items:[property],nextCursor:null};
 if(path==='/local-api/supply/items')return {items:[{id:itemId,sku:'TEST-WATER',name:'Synthetic water',unit:'piece'}],nextCursor:null};
 if(path==='/local-api/supply/stock')return {items:[{itemId,sku:'TEST-WATER',name:'Synthetic water',unit:'piece',quantity:'12'}],nextCursor:null};
 if(['/local-api/supply/orders','/local-api/supply/movements'].includes(path))return {items:[],nextCursor:null};
 if(path==='/local-api/folios')return {items:[],nextCursor:null,accountingMode:'operational_charges'};
 if(path==='/guest-api/session')return state.guest?{authenticated:true,csrf:'a'.repeat(64),profile:{userId:id,email:'guest@views.invalid',locale:'en',role:'guest',expiresAt:'2037-01-01T00:00:00Z'}}:{authenticated:false};
 if(path==='/guest-api/trips')return {items:[trip],nextCursor:null};
 if(path==='/guest-api/trips/'+id)return {trip};
 if(path==='/guest-api/trips/'+id+'/cancellation/preview')return {quoteId:itemId,reservationId:id,currency:'UZS',totalMinor:trip.totalMinor,netCollectedMinor:'0',penaltyMinor:'0',refundMinor:'0',refundBps:10000,policyTimezone:'Asia/Tashkent',checkInAt:trip.checkInAt,expiresAt:'2037-01-01T00:00:00Z',refundStatus:'not_required'};
 return undefined;
}
module.exports={id,property,permissions,response};
