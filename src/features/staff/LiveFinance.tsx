import {useEffect,useState} from "react";
import type {LiveFinanceSummary} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorText(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

function Panel({title,children}:{title:string;children:React.ReactNode}){
  return <section className="panel"><header><small>VIEWS FINANCE READ MODEL</small><h2>{title}</h2></header>{children}</section>;
}

export function LiveFinance(){
  const [data,setData]=useState<LiveFinanceSummary|null>(null);
  const [error,setError]=useState("");

  useEffect(()=>{
    let cancelled=false;
    void api.financeSummary("utower")
      .then(result=>{if(!cancelled){setData(result);setError("")}})
      .catch(err=>{if(!cancelled)setError(errorText(err))});
    return ()=>{cancelled=true};
  },[]);

  const unbalanced=data?.ledger.unbalancedPostedJournals.length??0;

  return <div>
    {error&&<div className="notice">{error}</div>}

    <section className="kpis">
      <article><span>Payment currencies</span><b>{data?.payments.length??"—"}</b></article>
      <article><span>Posted journals</span><b>{data?.ledger.postedJournals??"—"}</b></article>
      <article><span>Unbalanced journals</span><b>{data?unbalanced:"—"}</b></article>
      <article><span>Live money</span><b>{data?.liveMoneyEnabled?"ON":"OFF"}</b></article>
    </section>

    {data&&unbalanced>0&&<div className="notice">FINANCE_INTEGRITY_ALERT: one or more posted ledger journals are not balanced. Do not treat this projection as release-ready.</div>}

    <div className="staffBoard">
      <Panel title="Payment projection">
        {!data?.payments.length?<div className="emptyLine">No payment projection has been synchronized to staging yet.</div>:
        <div className="compactRows">{data.payments.map(item=><div key={item.currency}>
          <span>{item.currency}</span>
          <b>{item.intents} payment intents</b>
          <small>
            Amount {item.amountMinor} · Captured {item.capturedMinor} · Refunded {item.refundedMinor} · Net captured {item.netCapturedMinor} minor units
          </small>
          <i>{item.projectedAt??"projection timestamp unavailable"}</i>
        </div>)}</div>}
      </Panel>

      <Panel title="Ledger account projection">
        {!data?.ledger.accounts.length?<div className="emptyLine">No posted ledger account balances are projected to staging yet.</div>:
        <div className="compactRows">{data.ledger.accounts.map(item=><div key={item.currency+item.accountCode}>
          <span>{item.currency}</span>
          <b>{item.accountCode.replaceAll("_"," ")}</b>
          <small>{item.accountType} · debit {item.debitMinor} · credit {item.creditMinor} · net debit {item.netDebitMinor} minor units</small>
        </div>)}</div>}
      </Panel>
    </div>

    <div className="notice">
      Source of truth: {data?.sourceOfTruth??"PostgreSQL payments ledger"}. This D1 surface is read-only. It never collects PAN/CVV and cannot initiate, capture or refund money.
    </div>
  </div>;
}
