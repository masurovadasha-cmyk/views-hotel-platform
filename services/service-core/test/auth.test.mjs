import test from "node:test";import assert from "node:assert/strict";import {createHmac} from "node:crypto";
import {verifySignedContext,requireRole} from "../src/auth.mjs";
const secret="this-is-a-development-only-secret-at-least-32-bytes";
function sign(data){const body=Buffer.from(JSON.stringify(data)).toString("base64url");return body+"."+createHmac("sha256",secret).update(body).digest("base64url")}
test("valid context is accepted",()=>{const data={sub:"user-1",organizationId:"org-1",roles:["dispatcher"],exp:2000000000};assert.equal(verifySignedContext(sign(data),secret,1800000000).sub,"user-1")});
test("expired token rejected",()=>assert.throws(()=>verifySignedContext(sign({sub:"u",organizationId:"o",roles:[],exp:100}),secret,101),/Unauthorized/));
test("tampered token rejected",()=>{const token=sign({sub:"u",organizationId:"o",roles:[],exp:2000000000});assert.throws(()=>verifySignedContext(token+"x",secret,1800000000),/Unauthorized/)});
test("RBAC denies unauthorized role",()=>assert.throws(()=>requireRole({roles:["guest"]},["dispatcher"]),/Forbidden/));
