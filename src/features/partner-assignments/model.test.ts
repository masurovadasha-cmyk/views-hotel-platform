import {describe,it,expect} from 'vitest';
import {assignment,receipt,page,dispatchOrder,command,decideJournal,type Command} from './model';
const id='11111111-1111-4111-8111-111111111111',key='22222222-2222-4222-8222-222222222222',scope='partner:synthetic-grant';
const cmd:Command={kind:'decision',key,scope,assignmentId:id,body:{action:'accept',expectedRevision:3,termsVersion:1}};
const dto={assignmentId:id,kind:'concierge',status:'offered',revision:3,termsVersion:1,requestedFor:'2027-01-01T10:00:00Z',expiresAt:'2027-01-01T11:00:00Z',synthetic:true};
describe('partner UI projection and durable intent contract',()=>{
 it('drops nonallowlisted PII and money, refuses non-synthetic or unsupported terms',()=>{
  expect(assignment({...dto,guestName:'Not allowed',amount:'12345'})).toEqual(dto);
  for(const changed of [{synthetic:false},{termsVersion:2},{requestedFor:'tomorrow'},{revision:-1},{revision:0},{revision:1000000000},{assignmentId:'not-id'}])expect(()=>assignment({...dto,...changed})).toThrow('invalid-response');
  expect(receipt({...dto,outcome:'applied',commandKey:key,status:'expired',idempotentReplay:true},key)).toMatchObject({status:'expired',outcome:'applied'});
  expect(receipt({outcome:'not_applied',commandKey:key,assignmentId:null,synthetic:true,idempotentReplay:false},key)).toMatchObject({outcome:'not_applied'});
  for(const bad of [{...dto,idempotentReplay:true},{outcome:'not_applied',assignmentId:id,synthetic:true,idempotentReplay:true},{outcome:'not_applied',assignmentId:null,synthetic:false,idempotentReplay:false}])expect(()=>receipt(bad,key)).toThrow();
 });
 it('requires bounded pages and allows minimal dispatch grants',()=>{
  expect(page({items:[],nextCursor:null},assignment)).toEqual({items:[],nextCursor:null});expect(()=>page({items:[],nextCursor:'url'},assignment)).toThrow();
  expect(dispatchOrder({orderId:id,kind:'concierge',revision:1,requestedFor:dto.requestedFor,grantsTruncated:true,grants:[{grantId:key,label:'Synthetic grant'}],guestName:'hidden'})).not.toHaveProperty('guestName');
 });
 it('CAS permits only one active intent and retries preserve exact body/key',()=>{
  expect(decideJournal(undefined,scope,{kind:'read'})).toEqual({format:1,revision:0,command:null});
  const stored=decideJournal(undefined,scope,{kind:'reserve',revision:0,command:cmd});expect(stored.command).toEqual(cmd);
  expect(()=>decideJournal(stored,scope,{kind:'reserve',revision:0,command:{...cmd,key:id}})).toThrow('changed');
  expect(()=>decideJournal(stored,scope,{kind:'reserve',revision:1,command:cmd})).toThrow('changed');
  expect(decideJournal(stored,scope,{kind:'read'}).command).toEqual(cmd);
  expect(()=>decideJournal(stored,scope,{kind:'settle',revision:1,key:id})).toThrow('changed');
  expect(decideJournal(stored,scope,{kind:'settle',revision:1,key})).toEqual({format:1,revision:2,command:null});
 });
 it('never resets unknown/corrupt versions or lets another scope reuse a command',()=>{
  for(const raw of [null,'bad',{format:2,revision:1,command:cmd},{format:1,revision:-1,command:cmd},{format:1,revision:0,command:cmd},{format:1,revision:1,command:{...cmd,token:'forbidden'}}])expect(()=>decideJournal(raw,scope,{kind:'read'})).toThrow('journal');
  expect(()=>decideJournal({format:1,revision:1,command:cmd},'partner:other',{kind:'read'})).toThrow('journal');
  expect(()=>decideJournal(undefined,'partner:other',{kind:'reserve',revision:0,command:cmd})).toThrow('changed');
 });
 it('bounds command fields and forbids extra secrets or arbitrary endpoints',()=>{
  for(const raw of [{...cmd,endpoint:'https://other'},{...cmd,body:{...cmd.body,cardToken:'none'}},{...cmd,key:'unstable'},{...cmd,body:{...cmd.body,termsVersion:2}}])expect(()=>command(raw)).toThrow('journal');
  const offer={kind:'offer',key,scope:'dispatch:synthetic',body:{orderId:id,grantId:key,expectedOrderRevision:1,expiresAt:dto.expiresAt}};expect(command(offer)).toEqual(offer);
 });
});
