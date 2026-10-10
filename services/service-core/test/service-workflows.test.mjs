import test from "node:test";import assert from "node:assert/strict";
import {canMoveLaundry,validateChecklist,canCompleteCleaning} from "../src/service-workflows.mjs";
test("laundry custody cannot skip steps",()=>{
 assert.equal(canMoveLaundry("registered","collected"),true);
 assert.equal(canMoveLaundry("registered","returned"),false);
 assert.equal(canMoveLaundry("processing","ready"),true);
 assert.equal(canMoveLaundry("returned","processing"),false);
});
test("checklist must contain unique valid items",()=>{
 assert.equal(validateChecklist([{code:"bathroom",label:"Ванная"},{code:"bed",label:"Кровать"}]),true);
 assert.throws(()=>validateChecklist([{code:"bed",label:"Кровать"},{code:"bed",label:"Повтор"}]),/Duplicate/);
});
test("cleaning requires verified checklist completion",()=>{
 assert.equal(canCompleteCleaning([{completedAt:"2026-10-09T14:00:00Z",completedBy:"staff-1"}]),true);
 assert.equal(canCompleteCleaning([{completedAt:null,completedBy:"staff-1"}]),false);
});
