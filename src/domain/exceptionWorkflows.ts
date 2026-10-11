export type ExceptionKind="lost_found"|"damage"|"inventory"|"handover";

export const exceptionPermissions={
  lost_found:["front_desk","concierge","general_manager","super_admin"],
  damage:["maintenance_manager","front_desk","general_manager","super_admin"],
  inventory:["housekeeping_supervisor","maintenance_manager","general_manager","super_admin"],
  handover:["front_desk","housekeeping_supervisor","maintenance_manager","reservation_manager","general_manager","super_admin"]
} as const;

export function mayManageException(role:string,kind:ExceptionKind){
  return (exceptionPermissions[kind] as readonly string[]).includes(role);
}

export function nextLostFoundStatus(current:string,action:"claim"|"return"|"close"){
  const rules={
    claim:{from:["pending"],to:"claimed"},
    return:{from:["pending","claimed"],to:"returned"},
    close:{from:["returned"],to:"closed"}
  } as const;
  const r=rules[action];
  if(!(r.from as readonly string[]).includes(current))throw new Error("INVALID_TRANSITION");
  return r.to;
}

export function nextDamageStatus(current:string,action:"review"|"resolve"|"close"){
  const rules={
    review:{from:["open"],to:"review"},
    resolve:{from:["open","review"],to:"resolved"},
    close:{from:["resolved"],to:"closed"}
  } as const;
  const r=rules[action];
  if(!(r.from as readonly string[]).includes(current))throw new Error("INVALID_TRANSITION");
  return r.to;
}
