import { json,type Env } from "./_shared";
export const onRequestGet=async({env}:{env:Env})=>json({status:"ok",service:"views-hotel-platform",environment:env.VIEWS_ENV||"staging",timestamp:new Date().toISOString()});
