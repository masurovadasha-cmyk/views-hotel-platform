import {createHash,timingSafeEqual} from "node:crypto";

export function assertInternalApiKey(
  provided:string|undefined,
  expected:string
){
  const left=digest(String(provided||""));
  const right=digest(expected);
  if(!timingSafeEqual(left,right)){
    throw new Error("INTERNAL_API_UNAUTHORIZED");
  }
}

function digest(value:string){
  return createHash("sha256").update(value).digest();
}
