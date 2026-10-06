const base=process.env.PAYME_PROOF_URL||"http://core:3001/v1/payments/payme/merchant";
const login=process.env.PAYME_LOGIN||"views-payme-test";
const key=process.env.PAYME_KEY||"fixture-test-key-0123456789abcdef";
const paymentIntentId=process.env.PAYMENT_INTENT_ID||"73333333-3333-4333-8333-333333333333";
const auth="Basic "+Buffer.from(login+":"+key).toString("base64");

async function raw(body,authorization=auth){
  const response=await fetch(base,{
    method:"POST",
    headers:{
      "content-type":"text/json; charset=UTF-8",
      authorization
    },
    body
  });
  const text=await response.text();
  if(response.status!==200)throw new Error("HTTP_"+response.status+":"+text);
  return JSON.parse(text);
}
async function rpc(id,method,params,authorization=auth){
  return raw(JSON.stringify({id,method,params}),authorization);
}
function same(a,b,label){
  if(JSON.stringify(a)!==JSON.stringify(b)){
    throw new Error(label+":"+JSON.stringify({a,b}));
  }
}
function expectError(value,code,label){
  if(value?.error?.code!==code){
    throw new Error(label+":"+JSON.stringify(value));
  }
}
function expectResult(value,label){
  if(!value?.result||value.error)throw new Error(label+":"+JSON.stringify(value));
  return value.result;
}

const badAuth=await rpc(
  1,"CheckPerformTransaction",
  {amount:500000,account:{payment_intent_id:paymentIntentId}},
  "Basic "+Buffer.from(login+":wrong").toString("base64")
);
expectError(badAuth,-32504,"bad auth");

const malformed=await raw("{");
expectError(malformed,-32700,"malformed JSON");

const check=await rpc(
  2,"CheckPerformTransaction",
  {amount:500000,account:{payment_intent_id:paymentIntentId}}
);
if(expectResult(check,"check").allow!==true)throw new Error("check not allowed");

expectError(await rpc(
  3,"CheckPerformTransaction",
  {amount:500001,account:{payment_intent_id:paymentIntentId}}
),-31001,"wrong amount");

expectError(await rpc(
  4,"CheckPerformTransaction",
  {amount:500000,account:{payment_intent_id:"79999999-9999-4999-8999-999999999999"}}
),-31050,"missing account");

const txid="aaaaaaaaaaaaaaaaaaaaaaaa";
const time=Date.now();
const createParams={
  id:txid,time,amount:500000,
  account:{payment_intent_id:paymentIntentId}
};
const created1=await rpc(5,"CreateTransaction",createParams);
const created2=await rpc(6,"CreateTransaction",createParams);
same(created1.result,created2.result,"create replay changed");
if(expectResult(created1,"create").state!==1)throw new Error("create state");

const checked1=expectResult(
  await rpc(7,"CheckTransaction",{id:txid}),
  "check state 1"
);
if(checked1.state!==1)throw new Error("check state 1 mismatch");

expectError(await rpc(
  8,"CreateTransaction",
  {...createParams,id:"bbbbbbbbbbbbbbbbbbbbbbbb"}
),-31008,"second transaction should be blocked");

const performed1=await rpc(9,"PerformTransaction",{id:txid});
const performed2=await rpc(10,"PerformTransaction",{id:txid});
same(performed1.result,performed2.result,"perform replay changed");
if(expectResult(performed1,"perform").state!==2)throw new Error("perform state");

const checked2=expectResult(
  await rpc(11,"CheckTransaction",{id:txid}),
  "check state 2"
);
if(checked2.state!==2||!checked2.perform_time)throw new Error("check state 2 mismatch");

const cancelled1=await rpc(12,"CancelTransaction",{id:txid,reason:5});
const cancelled2=await rpc(13,"CancelTransaction",{id:txid,reason:5});
same(cancelled1.result,cancelled2.result,"cancel replay changed");
if(expectResult(cancelled1,"cancel").state!==-2)throw new Error("cancel state");

const checked3=expectResult(
  await rpc(14,"CheckTransaction",{id:txid}),
  "check state -2"
);
if(checked3.state!==-2||checked3.reason!==5)throw new Error("check cancel mismatch");

const statement=expectResult(
  await rpc(15,"GetStatement",{from:time-1000,to:Date.now()+1000}),
  "statement"
);
if(
  !Array.isArray(statement.transactions)||
  statement.transactions.length!==1||
  statement.transactions[0].id!==txid||
  statement.transactions[0].state!==-2
){
  throw new Error("statement mismatch:"+JSON.stringify(statement));
}

expectError(await rpc(16,"UnknownMethod",{}),-32601,"unknown method");

console.log(JSON.stringify({
  schemaVersion:1,
  stage:"7.20",
  result:"pass",
  provider:"payme",
  mode:"sandbox-fixture",
  invalidAuthorizationCode:badAuth.error.code,
  createReplayStable:true,
  performReplayStable:true,
  cancelReplayStable:true,
  statementCount:statement.transactions.length,
  finalState:checked3.state,
  productionCredentialsUsed:false,
  realPaymeSandboxCalled:false
},null,2));
