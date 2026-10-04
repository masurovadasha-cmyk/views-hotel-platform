import { json,type Env } from "./_shared";
export const onRequestGet=async({env}:{env:Env})=>{
  if(!env.DB)return json({status:"degraded",database:"not-bound",timestamp:new Date().toISOString()},503);
  try{await env.DB.prepare("SELECT 1 AS ready").first();return json({status:"ready",database:"ok",timestamp:new Date().toISOString()})}
  catch{return json({status:"not-ready",database:"error",timestamp:new Date().toISOString()},503)}
};
