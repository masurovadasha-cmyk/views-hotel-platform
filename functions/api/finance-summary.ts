import {json,requestId,requireDatabase,type Env} from "./_shared";
import {resolveSession} from "./_auth";
import {canAccessProperty} from "./_authorization";

const allowedRoles=[
  "finance_manager","accountant","revenue_manager","owner_readonly","general_manager","super_admin"
];

export const onRequestGet=async({request,env}:{request:Request;env:Env})=>{
  const session=await resolveSession(request,env);
  if(!session||session.mode!=="staff")return json({error:"STAFF_AUTH_REQUIRED",requestId:requestId(request)},401);
  if(!allowedRoles.includes(session.role))return json({error:"FORBIDDEN",requestId:requestId(request)},403);
  let db;try{db=requireDatabase(env)}catch{return json({error:"DATABASE_NOT_BOUND",requestId:requestId(request)},503)}

  const propertyId=new URL(request.url).searchParams.get("propertyId")||session.propertyIds[0]||"";
  if(!canAccessProperty(session,propertyId))return json({error:"PROPERTY_FORBIDDEN",requestId:requestId(request)},403);

  const property=await db.prepare(
    "SELECT id FROM properties WHERE id=? AND organization_id=? AND is_active=1 LIMIT 1"
  ).bind(propertyId,session.organizationId).first<Record<string,unknown>>();
  if(!property)return json({error:"PROPERTY_NOT_FOUND",requestId:requestId(request)},404);

  const [paymentRows,journalRows,accountRows]=await db.batch([
    db.prepare([
      "SELECT currency,status,COUNT(*) AS intents,",
      "COALESCE(SUM(amount_minor),0) AS amount_minor,",
      "COALESCE(SUM(captured_minor),0) AS captured_minor,",
      "COALESCE(SUM(refunded_minor),0) AS refunded_minor,",
      "MAX(projected_at) AS projected_at ",
      "FROM finance_payment_projection ",
      "WHERE organization_id=? AND property_id=? ",
      "GROUP BY currency,status ORDER BY currency,status"
    ].join("")).bind(session.organizationId,propertyId),
    db.prepare([
      "SELECT j.id AS journal_id,e.currency,",
      "COALESCE(SUM(CASE WHEN e.side='debit' THEN e.amount_minor ELSE 0 END),0) AS debit_minor,",
      "COALESCE(SUM(CASE WHEN e.side='credit' THEN e.amount_minor ELSE 0 END),0) AS credit_minor,",
      "COUNT(e.id) AS entry_count ",
      "FROM finance_ledger_journal_projection j ",
      "LEFT JOIN finance_ledger_entry_projection e ON e.journal_id=j.id ",
      "WHERE j.organization_id=? AND j.property_id=? AND j.status='posted' ",
      "GROUP BY j.id,e.currency ORDER BY j.id,e.currency"
    ].join("")).bind(session.organizationId,propertyId),
    db.prepare([
      "SELECT e.account_code,e.account_type,e.currency,",
      "COALESCE(SUM(CASE WHEN e.side='debit' THEN e.amount_minor ELSE 0 END),0) AS debit_minor,",
      "COALESCE(SUM(CASE WHEN e.side='credit' THEN e.amount_minor ELSE 0 END),0) AS credit_minor ",
      "FROM finance_ledger_entry_projection e ",
      "JOIN finance_ledger_journal_projection j ON j.id=e.journal_id ",
      "WHERE j.organization_id=? AND j.property_id=? AND j.status='posted' ",
      "GROUP BY e.account_code,e.account_type,e.currency ",
      "ORDER BY e.currency,e.account_code"
    ].join("")).bind(session.organizationId,propertyId)
  ]);

  const paymentsByCurrency=new Map<string,{
    currency:string;intents:number;amountMinor:number;capturedMinor:number;refundedMinor:number;
    statuses:Record<string,number>;projectedAt:string|null
  }>();

  for(const raw of paymentRows.results||[]){
    const row=raw as Record<string,unknown>;
    const currency=String(row.currency);
    const current=paymentsByCurrency.get(currency)??{
      currency,intents:0,amountMinor:0,capturedMinor:0,refundedMinor:0,statuses:{},projectedAt:null
    };
    const intents=Number(row.intents||0);
    current.intents+=intents;
    current.amountMinor+=Number(row.amount_minor||0);
    current.capturedMinor+=Number(row.captured_minor||0);
    current.refundedMinor+=Number(row.refunded_minor||0);
    current.statuses[String(row.status)]=(current.statuses[String(row.status)]||0)+intents;
    const projected=row.projected_at?String(row.projected_at):null;
    if(projected&&(!current.projectedAt||projected>current.projectedAt))current.projectedAt=projected;
    paymentsByCurrency.set(currency,current);
  }

  const journals=new Map<string,{currencies:Set<string>;debitMinor:number;creditMinor:number;entryCount:number}>();
  for(const raw of journalRows.results||[]){
    const row=raw as Record<string,unknown>;
    const id=String(row.journal_id);
    const current=journals.get(id)??{currencies:new Set<string>(),debitMinor:0,creditMinor:0,entryCount:0};
    if(row.currency)current.currencies.add(String(row.currency));
    current.debitMinor+=Number(row.debit_minor||0);
    current.creditMinor+=Number(row.credit_minor||0);
    current.entryCount+=Number(row.entry_count||0);
    journals.set(id,current);
  }

  const unbalancedPostedJournals=[...journals.entries()]
    .filter(([,x])=>x.entryCount<2||x.currencies.size!==1||x.debitMinor!==x.creditMinor)
    .map(([id,x])=>({
      id,
      currencyCount:x.currencies.size,
      debitMinor:x.debitMinor,
      creditMinor:x.creditMinor,
      entryCount:x.entryCount
    }));

  const accounts=(accountRows.results||[]).map(raw=>{
    const row=raw as Record<string,unknown>;
    const debitMinor=Number(row.debit_minor||0),creditMinor=Number(row.credit_minor||0);
    return {
      accountCode:String(row.account_code),
      accountType:String(row.account_type),
      currency:String(row.currency),
      debitMinor,
      creditMinor,
      netDebitMinor:debitMinor-creditMinor
    };
  });

  return json({
    propertyId,
    sourceOfTruth:"postgres-payments-ledger",
    projection:"d1-finance-read-model",
    liveMoneyEnabled:false,
    payments:[...paymentsByCurrency.values()].map(x=>({
      ...x,
      netCapturedMinor:Math.max(0,x.capturedMinor-x.refundedMinor)
    })),
    ledger:{
      postedJournals:journals.size,
      unbalancedPostedJournals,
      accounts
    },
    requestId:requestId(request)
  });
};
