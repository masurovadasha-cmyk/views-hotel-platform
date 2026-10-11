import {describe,expect,it} from "vitest";
import {isAllowedOrigin,normalizeEmail,validEmail} from "./security";
describe("security contracts",()=>{
 it("normalizes email",()=>expect(normalizeEmail(" User@Example.COM ")).toBe("user@example.com"));
 it("validates email shape",()=>{expect(validEmail("guest@example.com")).toBe(true);expect(validEmail("bad")).toBe(false)});
 it("rejects unknown mutation origins",()=>{expect(isAllowedOrigin("https://evil.example",["https://views.example"])).toBe(false);expect(isAllowedOrigin("https://views.example/path",["https://views.example"])).toBe(true)});
});
