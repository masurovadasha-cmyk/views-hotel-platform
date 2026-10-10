import {randomBytes,createHash} from "node:crypto";
export function createPkcePair(){
 const verifier=randomBytes(32).toString("base64url");
 const challenge=createHash("sha256").update(verifier).digest("base64url");
 return {verifier,challenge,method:"S256"};
}
export function validateOidcBrowserConfig({issuer,clientId,redirectUri,scope="openid profile"}){
 for(const value of [issuer,clientId,redirectUri])if(typeof value!=="string"||!value)throw Error("OIDC browser config missing");
 const provider=new URL(issuer),callback=new URL(redirectUri);
 if(provider.protocol!=="https:")throw Error("Issuer requires HTTPS");
 if(callback.protocol!=="https:"&&!(callback.protocol==="http:"&&["127.0.0.1","localhost"].includes(callback.hostname)))throw Error("Redirect requires HTTPS");
 if(callback.username||callback.password||callback.hash||provider.username||provider.password)throw Error("Unsafe OIDC URL");
 if(!scope.split(/\s+/).includes("openid"))throw Error("OpenID scope required");
 return {issuer:provider.href,clientId,redirectUri:callback.href,scope};
}
