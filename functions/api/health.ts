export const onRequestGet:PagesFunction=async()=>Response.json({status:"ok",service:"views-hotel-platform",timestamp:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
