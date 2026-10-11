export type RequestActorContext={
  organizationId:string;
  userId:string;
  membershipId:string;
  requestId:string;
};

export function requireUuid(value:string|undefined,name:string){
  if(!value||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)){
    throw new Error("INVALID_"+name.toUpperCase());
  }
  return value;
}
