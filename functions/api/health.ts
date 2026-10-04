export const onRequestGet=async()=>Response.json({status:"ok",service:"views-hotel-platform",timestamp:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
