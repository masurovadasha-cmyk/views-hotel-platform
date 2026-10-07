import {useLegacyStaffLocale} from './LegacyStaffLocale';
import {useEffect,useState} from "react";
import type {LiveFinanceSummary} from "../../api/types";
import {api,ApiError} from "../../api/client";

function errorText(error:unknown){
  if(error instanceof ApiError)return error.body.error||error.message;
  return error instanceof Error?error.message:"Request failed";
}

function Panel({title,children}:{title:string;children:React.ReactNode}){
  const {t,locale}=useLegacyStaffLocale();
  return <section className="panel"><header><small>{t("VIEWS FINANCE READ MODEL")}</small><h2>{t(String(title))}</h2></header>{children}</section>;
}

export function LiveFinance(){
  const {t,locale}=useLegacyStaffLocale();
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
    {error&&<div className="notice">{t(String(error))}</div>}

    <section className="kpis">
      <article><span>{t("Payment currencies")}</span><b>{data?.payments.length??"—"}</b></article>
      <article><span>{t("Posted journals")}</span><b>{data?.ledger.postedJournals??"—"}</b></article>
      <article><span>{t("Unbalanced journals")}</span><b>{data?unbalanced:"—"}</b></article>
      <article><span>{t("Live money")}</span><b>{data?.liveMoneyEnabled?t("ON"):t("OFF")}</b></article>
    </section>

    {data&&unbalanced>0&&<div className="notice">{t("FINANCE_INTEGRITY_ALERT: one or more posted ledger journals are not balanced. Do not treat this projection as release-ready.")}</div>}

    <div className="staffBoard">
      <Panel title={t("Payment projection")}>
        {!data?.payments.length?<div className="emptyLine">{t("No payment projection has been synchronized to staging yet.")}</div>:
        <div className="compactRows">{data.payments.map(item=><div key={item.currency}>
          <span>{item.currency}</span>
          <b>{item.intents} {' '}{t("payment intents")}</b>
          <small>
            {t("Amount")}{' '}{item.amountMinor} {' '}{t("· Captured")}{' '}{item.capturedMinor} {' '}{t("· Refunded")}{' '}{item.refundedMinor} {' '}{t("· Net captured")}{' '}{item.netCapturedMinor} {' '}{t("minor units")}{' '}</small>
          <i>{item.projectedAt??t("projection timestamp unavailable")}</i>
        </div>)}</div>}
      </Panel>

      <Panel title={t("Ledger account projection")}>
        {!data?.ledger.accounts.length?<div className="emptyLine">{t("No posted ledger account balances are projected to staging yet.")}</div>:
        <div className="compactRows">{data.ledger.accounts.map(item=><div key={item.currency+item.accountCode}>
          <span>{item.currency}</span>
          <b>{t(String(item.accountCode.replace(/_/g," ")))}</b>
          <small>{t(String(item.accountType))} {' '}{t("· debit")}{' '}{item.debitMinor} {' '}{t("· credit")}{' '}{item.creditMinor} {' '}{t("· net debit")}{' '}{item.netDebitMinor} {' '}{t("minor units")}</small>
        </div>)}</div>}
      </Panel>
    </div>

    <div className="notice">
      {t("Source of truth:")}{' '}{data?.sourceOfTruth??t("PostgreSQL payments ledger")}{t(". This D1 surface is read-only. It never collects PAN/CVV and cannot initiate, capture or refund money.")}{' '}</div>
  </div>;
}
