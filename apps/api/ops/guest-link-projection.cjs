'use strict';
module.exports=b=>{
 if(!b||typeof b.reservationId!=='string'||typeof b.confirmationCode!=='string'||typeof b.checkInAt!=='string'||typeof b.checkOutAt!=='string'||typeof b.timezone!=='string'||typeof b.accepted!=='boolean')throw Error('INVALID_LINK_RESPONSE');
 const propertyName={};for(const lang of ['ru','uz','en'])if(typeof b.propertyName?.[lang]==='string')propertyName[lang]=b.propertyName[lang];
 return {reservationId:b.reservationId,confirmationCode:b.confirmationCode,checkInAt:b.checkInAt,checkOutAt:b.checkOutAt,timezone:b.timezone,propertyName,accepted:b.accepted};
};
