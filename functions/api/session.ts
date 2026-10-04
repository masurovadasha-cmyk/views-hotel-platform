import { json,requestId } from "./_shared";

export const onRequestGet=async({request}:{request:Request})=>{
  const role=request.headers.get("x-views-demo-role");
  if(!role) return json({authenticated:false,requestId:requestId(request)});
  if(role==="guest") return json({authenticated:true,session:{mode:"guest",userId:"guest-demo",guestId:"guest-demo",organizationId:"views"},requestId:requestId(request)});
  return json({authenticated:true,session:{mode:"staff",userId:"staff-demo",role,organizationId:"views",propertyIds:["utower"]},requestId:requestId(request)});
};
