import {describe,expect,it} from "vitest";
import {journalBalance,netCapturedMinor} from "./_finance";

describe("finance projection helpers",()=>{
  it("accepts a balanced two-sided journal",()=>{
    expect(journalBalance([
      {journalId:"j1",side:"debit",amountMinor:1000,currency:"UZS"},
      {journalId:"j1",side:"credit",amountMinor:1000,currency:"UZS"}
    ])).toEqual({debitMinor:1000,creditMinor:1000,currencyCount:1,balanced:true});
  });

  it("rejects cross-currency or unbalanced journals",()=>{
    expect(journalBalance([
      {journalId:"j1",side:"debit",amountMinor:1000,currency:"UZS"},
      {journalId:"j1",side:"credit",amountMinor:900,currency:"UZS"}
    ]).balanced).toBe(false);
    expect(journalBalance([
      {journalId:"j1",side:"debit",amountMinor:1000,currency:"UZS"},
      {journalId:"j1",side:"credit",amountMinor:1000,currency:"USD"}
    ]).balanced).toBe(false);
  });

  it("never reports negative net captured",()=>{
    expect(netCapturedMinor(1000,250)).toBe(750);
    expect(netCapturedMinor(1000,1200)).toBe(0);
  });
});
