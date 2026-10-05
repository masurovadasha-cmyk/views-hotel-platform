import type {StaffSession} from "./_authorization";
import type {Env} from "./_shared";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class CoreBridgeError extends Error{
  constructor(public code:string){
    super(code);
    this.name="CoreBridgeError";
  }
}

export type CoreActorLink={
  organizationId:string;
  userId:string;
  membershipId:string;
};

export async function resolveCoreActor(
  session:StaffSession,
  env:Env
):Promise<CoreActorLink>{
  if(!env.DB)throw new CoreBridgeError("DATABASE_NOT_BOUND");

  const row=await env.DB.prepare(
    "SELECT core_organization_id,core_user_id,core_membership_id FROM core_identity_links WHERE local_organization_id=? AND local_user_id=? AND is_active=1 LIMIT 1"
  ).bind(session.organizationId,session.userId).first<Record<string,unknown>>();

  if(!row)throw new CoreBridgeError("CORE_IDENTITY_NOT_LINKED");

  const organizationId=validUuid(row.core_organization_id,"CORE_ORGANIZATION_ID_INVALID");
  const userId=validUuid(row.core_user_id,"CORE_USER_ID_INVALID");
  const membershipId=validUuid(row.core_membership_id,"CORE_MEMBERSHIP_ID_INVALID");
  return {organizationId,userId,membershipId};
}

export async function resolveCoreProperty(
  session:StaffSession,
  env:Env,
  localPropertyId:string
){
  if(!localPropertyId)throw new CoreBridgeError("PROPERTY_ID_REQUIRED");
  if(session.role!=="super_admin"&&!session.propertyIds.includes(localPropertyId)){
    throw new CoreBridgeError("PROPERTY_FORBIDDEN");
  }
  if(!env.DB)throw new CoreBridgeError("DATABASE_NOT_BOUND");

  const row=await env.DB.prepare(
    "SELECT core_property_id FROM core_property_links WHERE local_organization_id=? AND local_property_id=? AND is_active=1 LIMIT 1"
  ).bind(session.organizationId,localPropertyId).first<Record<string,unknown>>();

  if(!row)throw new CoreBridgeError("CORE_PROPERTY_NOT_LINKED");
  return validUuid(row.core_property_id,"CORE_PROPERTY_ID_INVALID");
}

export function coreApiConfig(env:Env){
  const rawUrl=env.VIEWS_CORE_API_URL?.trim();
  if(!rawUrl)throw new CoreBridgeError("CORE_API_NOT_CONFIGURED");

  let url:URL;
  try{url=new URL(rawUrl)}catch{throw new CoreBridgeError("CORE_API_URL_INVALID")}
  if(url.username||url.password||url.hash){
    throw new CoreBridgeError("CORE_API_URL_INVALID");
  }
  if(env.VIEWS_ENV==="production"&&url.protocol!=="https:"){
    throw new CoreBridgeError("CORE_API_URL_INSECURE");
  }
  if(!["https:","http:"].includes(url.protocol)){
    throw new CoreBridgeError("CORE_API_URL_INVALID");
  }

  const key=env.VIEWS_CORE_API_KEY?.trim();
  if(!key||key.length<32)throw new CoreBridgeError("CORE_API_KEY_NOT_CONFIGURED");

  return {
    baseUrl:url.origin,
    internalKey:key
  };
}

function validUuid(value:unknown,code:string){
  const id=String(value||"").trim();
  if(!UUID.test(id))throw new CoreBridgeError(code);
  return id;
}
