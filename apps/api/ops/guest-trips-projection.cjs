'use strict';
// Keep the browser response narrow even if an upstream contract expands.
module.exports=function project(payload){
 function trip(t){
  if(!t||typeof t.id!=='string'||typeof t.confirmationCode!=='string'||typeof t.status!=='string'
   ||typeof t.checkInAt!=='string'||typeof t.checkOutAt!=='string'||! /^[A-Z]{3}$/.test(t.currency)
   ||typeof t.totalMinor!=='string'||! /^\d{1,19}$/.test(t.totalMinor)||!t.property||typeof t.property.city!=='string'||typeof t.property.timezone!=='string')throw Error('INVALID_TRIP_RESPONSE');
  const name={};for(const key of ['ru','uz','en'])if(typeof t.property.name?.[key]==='string')name[key]=t.property.name[key];
  return {id:t.id,confirmationCode:t.confirmationCode,status:t.status,checkInAt:t.checkInAt,checkOutAt:t.checkOutAt,currency:t.currency,
   totalMinor:t.totalMinor,property:{name,city:t.property.city,timezone:t.property.timezone}};
 }
 if(Object.hasOwn(payload,'trip'))return {trip:trip(payload.trip)};
 if(!Array.isArray(payload.items)||payload.items.length>20||(payload.nextCursor!==null&&(typeof payload.nextCursor!=='string'||!/^[A-Za-z0-9_-]{1,300}$/.test(payload.nextCursor))))throw Error('INVALID_TRIP_RESPONSE');
 return {items:payload.items.map(trip),nextCursor:payload.nextCursor};
};
