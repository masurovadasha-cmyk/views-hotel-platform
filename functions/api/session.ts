import {json,requestId,type Env} from "./_shared";
import {resolveSession} from "./_auth";

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  return json({authenticated:Boolean(session),session:session??undefined,requestId:requestId(request)});
};
