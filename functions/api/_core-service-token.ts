const KID=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/;
const SERVICE_ID=/^[a-z0-9][a-z0-9._:-]{1,63}$/;
const REQUEST_ID=/^[A-Za-z0-9._:/-]{1,160}$/;
const TTL_SECONDS=30;

export async function createCoreServiceToken(input:{
  serviceId:string;
  kid:string;
  privateKeyPem:string;
  method:string;
  path:string;
  requestId:string;
  nowSeconds?:number;
}){
  if(!SERVICE_ID.test(input.serviceId))throw new Error("CORE_SERVICE_ID_INVALID");
  if(!KID.test(input.kid))throw new Error("CORE_SIGNING_KID_INVALID");
  if(!REQUEST_ID.test(input.requestId))throw new Error("CORE_REQUEST_ID_INVALID");

  const method=input.method.toUpperCase();
  const path=normalizePath(input.path);
  const now=input.nowSeconds??Math.floor(Date.now()/1000);

  const header={
    alg:"EdDSA",
    typ:"views-service+jwt",
    kid:input.kid
  };
  const payload={
    iss:input.serviceId,
    sub:input.serviceId,
    aud:"views-core",
    iat:now,
    exp:now+TTL_SECONDS,
    jti:crypto.randomUUID(),
    htm:method,
    htp:path,
    rid:input.requestId
  };

  const encodedHeader=base64Url(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload=base64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput=encodedHeader+"."+encodedPayload;
  const key=await importEd25519PrivateKey(input.privateKeyPem);
  const signature=await crypto.subtle.sign(
    {name:"Ed25519"},
    key,
    new TextEncoder().encode(signingInput)
  );

  return signingInput+"."+base64Url(new Uint8Array(signature));
}

async function importEd25519PrivateKey(pem:string){
  const normalized=pem.trim();
  const match=normalized.match(
    /^-----BEGIN PRIVATE KEY-----\s*([A-Za-z0-9+/=\s]+)\s*-----END PRIVATE KEY-----$/
  );
  if(!match)throw new Error("CORE_SIGNING_PRIVATE_KEY_INVALID");

  let bytes:Uint8Array;
  try{
    const binary=atob(match[1].replace(/\s+/g,""));
    bytes=Uint8Array.from(binary,char=>char.charCodeAt(0));
  }catch{
    throw new Error("CORE_SIGNING_PRIVATE_KEY_INVALID");
  }

  try{
    const keyData=new ArrayBuffer(bytes.byteLength);
    new Uint8Array(keyData).set(bytes);
    return await crypto.subtle.importKey(
      "pkcs8",
      keyData,
      {name:"Ed25519"},
      false,
      ["sign"]
    );
  }catch{
    throw new Error("CORE_SIGNING_PRIVATE_KEY_INVALID");
  }
}

function base64Url(bytes:Uint8Array){
  let binary="";
  for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g,"-")
    .replace(/\//g,"_")
    .replace(/=+$/,"");
}

function normalizePath(value:string){
  const raw=String(value||"").trim();
  if(!raw.startsWith("/")||raw.length>240){
    throw new Error("CORE_SIGNING_PATH_INVALID");
  }
  const query=raw.indexOf("?");
  return query===-1?raw:raw.slice(0,query);
}
