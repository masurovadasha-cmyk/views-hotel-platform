import type {Attempt} from '../service-orders/model';
import {marketReceiptAttempt} from './guest-market-receipt';
import {parseMarketDetail} from './GuestMarketDetail';
type IssueAttempt=Attempt&{issueExpectation:{stage:string;totalMinor:string;currency:string}};
export function canReportMarket(stage:string,issue?:{status:string}|null){return ['handed_over','completed'].includes(stage)&&issue?.status!=='open';}
export function marketIssueAttempt(orderId:string,revision:number,stage:string,totalMinor:string,currency:string,note:string,key:string):IssueAttempt{
 const base=marketReceiptAttempt(orderId,revision,totalMinor,currency,key);
 if(!canReportMarket(stage)||typeof note!=='string'||note.trim().length<3||note.trim().length>1000||/[\u0000-\u001f\u007f]/.test(note))throw Error('SERVICE_INPUT_INVALID');
 return {route:base.route,key,body:{action:'report_issue',expectedRevision:revision,note:note.trim()},issueExpectation:{stage,totalMinor,currency}};
}
export function assertMarketIssueReceipt(raw:unknown,attempt:Attempt):void{
 try{
  const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw as Record<string,unknown>:null,e=(attempt as Partial<IssueAttempt>).issueExpectation;
  if(!e||typeof e!=='object'||Array.isArray(e))throw Error();
  const canonical=marketIssueAttempt(attempt.route.split('/')[2],attempt.body.expectedRevision as number,e.stage,e.totalMinor,e.currency,attempt.body.note as string,attempt.key);
  if(attempt.route!==canonical.route||attempt.body.action!=='report_issue'||attempt.body.note!==canonical.body.note||!r||r.orderId!==attempt.route.split('/')[2]||r.stage!==e.stage||r.revision!==(attempt.body.expectedRevision as number)+1||r.totalMinor!==e.totalMinor||r.currency!==e.currency||typeof r.idempotentReplay!=='boolean')throw Error();
  const detail=parseMarketDetail(r);if(detail.issue?.status!=='open'||detail.issue.note!==attempt.body.note||detail.issue.answer!==null)throw Error();
 }catch{throw Error('INVALID_RESPONSE');}
}
