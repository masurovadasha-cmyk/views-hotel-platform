import {createHash,timingSafeEqual} from "node:crypto";

export function assertInternalApiKey(
  provided:string|undefined,
  expected:string|readonly string[]
){
  const candidates=typeof expected==="string"?[expected]:[...expected];
  const left=digest(String(provided||""));

  let matched=false;
  for(const candidate of candidates){
    const equal=timingSafeEqual(left,digest(candidate));
    matched=equal||matched;
  }

  if(!candidates.length||!matched){
    throw new Error("INTERNAL_API_UNAUTHORIZED");
  }
}

function digest(value:string){
  return createHash("sha256").update(value).digest();
}
