export function transitionHousekeeping(status:string,action:"start"|"complete"|"verify"){
  const map={start:{from:["dirty"],to:"cleaning"},complete:{from:["cleaning"],to:"inspection"},verify:{from:["inspection"],to:"ready"}} as const;
  const rule=map[action];
  if(!rule.from.includes(status as never))throw new Error("Invalid housekeeping transition");
  return rule.to;
}
export function transitionMaintenance(status:string,action:"start"|"resolve"|"verify"){
  const map={start:{from:["open","assigned"],to:"in_progress"},resolve:{from:["open","assigned","in_progress","waiting","blocked"],to:"inspection"},verify:{from:["inspection"],to:"closed"}} as const;
  const rule=map[action];
  if(!rule.from.includes(status as never))throw new Error("Invalid maintenance transition");
  return rule.to;
}
export function transitionServiceOrder(status:string,action:"accept"|"start"|"complete"){
  const map={accept:{from:["new","assigned"],to:"accepted"},start:{from:["new","assigned","accepted","waiting"],to:"in_progress"},complete:{from:["accepted","in_progress","waiting"],to:"done"}} as const;
  const rule=map[action];
  if(!rule.from.includes(status as never))throw new Error("Invalid service order transition");
  return rule.to;
}
