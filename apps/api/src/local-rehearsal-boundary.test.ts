import {describe,it,expect} from "vitest";
import {resolveListenHost} from "./local-rehearsal-boundary";
const env={VIEWS_LOCAL_REHEARSAL:"true",NODE_ENV:"test",VIEWS_ENV:"local-rehearsal",TRUSTED_PROXY_MODE:"direct",DATABASE_URL:"postgresql://views_app:fixture@127.0.0.1:55432/views_local",VIEWS_PAYME_MODE:"sandbox"};
describe("local rehearsal boundary",()=>{
 it("leaves existing container behavior unchanged",()=>expect(resolveListenHost({})).toBe("0.0.0.0"));
 it("binds explicit rehearsal only to loopback",()=>expect(resolveListenHost(env)).toBe("127.0.0.1"));
 for(const [key,value] of [["NODE_ENV","production"],["VIEWS_ENV","staging"],["TRUSTED_PROXY_MODE","cloudflare"],["VIEWS_PAYME_MODE","production"]])
  it("rejects scope change "+key,()=>expect(()=>resolveListenHost({...env,[key]:value})).toThrow());
 for(const value of ["postgresql://views_owner:x@127.0.0.1:55432/views_local","postgresql://views_app:x@localhost:55432/views_local","postgresql://views_app:x@127.0.0.1:5432/views_local","postgresql://views_app:x@127.0.0.1:55432/production","postgresql://views_app:x@db.example:55432/views_local","postgresql://views_app:x@127.0.0.1:55432/views_local?sslmode=disable"])
  it("rejects alternative database "+value,()=>expect(()=>resolveListenHost({...env,DATABASE_URL:value})).toThrow("LOCAL_REHEARSAL_DATABASE_INVALID"));
});
