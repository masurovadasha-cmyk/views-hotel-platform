export type FinanceLedgerEntry={
  journalId:string;
  side:"debit"|"credit";
  amountMinor:number;
  currency:string;
};

export function journalBalance(entries:FinanceLedgerEntry[]){
  const currencies=new Set(entries.map(x=>x.currency));
  const debit=entries.filter(x=>x.side==="debit").reduce((sum,x)=>sum+x.amountMinor,0);
  const credit=entries.filter(x=>x.side==="credit").reduce((sum,x)=>sum+x.amountMinor,0);
  return {
    debitMinor:debit,
    creditMinor:credit,
    currencyCount:currencies.size,
    balanced:entries.length>0&&currencies.size===1&&debit===credit
  };
}

export function netCapturedMinor(capturedMinor:number,refundedMinor:number){
  return Math.max(0,capturedMinor-refundedMinor);
}
