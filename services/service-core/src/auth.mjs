import {createHmac,timingSafeEqual} from "node:crypto";
/**
 * Local integration-only signed context tokens. In production use a dedicated OIDC/JWKS
 * verifier and centrally managed RBAC. Never trust organizationId from a request body.
 */
export function verifySignedContext(token,secret,now=Math.floor(Date.now()/1000)){
 if(typeof token!=="string"||typeof secret!=="string"||secret.length<32)throw Error("Unauthorized");
 const parts=token.split(".");
 if(parts.length!==2)throw Error("Unauthorized");
 const [payload,signature]=parts;
 const expected=createHmac("sha256",secret).update(payload).digest("base64url");
 const a=Buffer.from(signature),b=Buffer.from(expected);
 if(a.length!==b.length||!timingSafeEqual(a,b))throw Error("Unauthorized");
 let data;try{data=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"))}catch{throw Error("Unauthorized")}
 if(!data||typeof data.sub!=="string"||typeof data.organizationId!=="string"||!Number.isSafeInteger(data.exp)||data.exp<=now)throw Error("Unauthorized");
 if(!Array.isArray(data.roles)||data.roles.some(x=>typeof x!=="string"))throw Error("Unauthorized");
 return data;
}
export function requireRole(context,allowed){if(!context.roles.some(role=>allowed.includes(role)))throw Error("Forbidden")}
