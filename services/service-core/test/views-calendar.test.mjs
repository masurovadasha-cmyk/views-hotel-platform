import test from "node:test";
import assert from "node:assert/strict";
import {nights} from "../public/views-calendar.js";
test("calendar range counts checkout-exclusive nights across months",()=>{
 assert.equal(nights("2026-10-13","2026-10-25"),12);
 assert.equal(nights("2026-10-31","2026-11-01"),1);
 assert.equal(nights("2028-02-28","2028-03-01"),2);
});
test("calendar night counts ignore timezone and daylight saving shifts",()=>{
 assert.equal(nights("2026-03-28","2026-03-30"),2);
 assert.equal(nights(null,null),0);
});
