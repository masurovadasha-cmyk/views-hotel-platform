export function isAllowedOrigin(origin:string|null,allowedOrigins:string[]){
  if(!origin)return false;
  try{return allowedOrigins.includes(new URL(origin).origin)}catch{return false}
}
export function normalizeEmail(value:string){return value.trim().toLowerCase()}
export function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value))}
