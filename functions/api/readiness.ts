export const onRequestGet=async()=>Response.json({status:"ready",runtime:"cloudflare-pages",database:"not-bound",timestamp:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
