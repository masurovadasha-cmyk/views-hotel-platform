import {json,type Env} from "./_shared";

const REQUIRED_TABLES=[
  "organizations","properties","reservations","service_orders","app_sessions",
  "stays","operations_events","outbox_events","integrations"
];

export const onRequestGet=async({env}:{env:Env})=>{
  const timestamp=new Date().toISOString();
  if(!env.DB)return json({status:"degraded",database:"not-bound",schema:"unknown",timestamp},503);

  try{
    await env.DB.prepare("SELECT 1 AS ready").first();
    const marks=REQUIRED_TABLES.map(()=>"?").join(",");
    const row=await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name IN ("+marks+")"
    ).bind(...REQUIRED_TABLES).first<{count:number}>();

    const schemaOk=Number(row?.count||0)===REQUIRED_TABLES.length;
    if(!schemaOk)return json({status:"not-ready",database:"ok",schema:"incomplete",timestamp},503);

    return json({status:"ready",database:"ok",schema:"ok",timestamp});
  }catch{
    return json({status:"not-ready",database:"error",schema:"unknown",timestamp},503);
  }
};
