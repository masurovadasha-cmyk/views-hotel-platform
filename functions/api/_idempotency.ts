export function scopedIdempotencyKey(organizationId:string,raw:string|null){
  const key=String(raw||"").trim();
  if(key.length<8||key.length>200)return null;
  return organizationId+":"+key;
}
