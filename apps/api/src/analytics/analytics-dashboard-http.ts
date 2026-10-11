export function dashboardEtag(sourceFingerprint:string){
  if(!/^[a-f0-9]{64}$/.test(sourceFingerprint)){
    throw new Error("INVALID_DASHBOARD_SOURCE_FINGERPRINT");
  }
  return "\"views-dashboard-v1-"+sourceFingerprint+"\"";
}

export function matchesIfNoneMatch(
  header:string|undefined,
  etag:string
){
  if(!header)return false;
  const expected=stripWeak(etag);
  return header.split(",").some(raw=>{
    const candidate=raw.trim();
    if(candidate==="*")return true;
    return stripWeak(candidate)===expected;
  });
}

function stripWeak(value:string){
  return value.startsWith("W/")?value.slice(2):value;
}
