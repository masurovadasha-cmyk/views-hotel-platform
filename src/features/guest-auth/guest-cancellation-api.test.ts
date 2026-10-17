import {afterEach,describe,expect,it,vi} from 'vitest';
import {cancellationPreview,cancellationReceipt,guestCancellation,type CancellationPreview} from './guest-cancellation-api';
const id='10000000-0000-4000-8000-000000000001',quoteId='10000000-0000-4000-8000-000000000002';
const quote:CancellationPreview={quoteId,reservationId:id,currency:'UZS',totalMinor:'9007199254740993123',netCollectedMinor:'9007199254740993123',penaltyMinor:'1',refundMinor:'9007199254740993122',refundBps:10000,policyTimezone:'Asia/Tashkent',checkInAt:'2099-01-01T10:00:00.000Z',expiresAt:'2098-12-01T10:05:00.000Z',refundStatus:'pending'};
const receipt={cancellationId:'10000000-0000-4000-8000-000000000003',reservationId:id,currency:'UZS',status:'cancelled',refundMinor:quote.refundMinor,penaltyMinor:'1',refundStatus:'pending',idempotentReplay:false};
afterEach(()=>vi.unstubAllGlobals());
describe('guest cancellation financial response boundary',()=>{
 it('preserves exact bigint minor amounts and rejects numeric or impossible money',()=>{
  expect(cancellationPreview(quote,id).refundMinor).toBe('9007199254740993122');
  for(const patch of [{refundMinor:9007199254740993000},{refundMinor:'-1'},{refundMinor:'9007199254740993124'},{penaltyMinor:'9007199254740993124'},{refundStatus:'not_required'}])expect(()=>cancellationPreview({...quote,...patch},id)).toThrow();
 });
 it('rejects foreign booking, malformed policy timestamps/timezone and invalid refund rates',()=>{
  for(const patch of [{reservationId:quoteId},{quoteId:'not-id'},{currency:'UZS<script>'},{policyTimezone:'nowhere'},{checkInAt:'invalid'},{expiresAt:null},{refundBps:10001},{refundBps:0.5}])expect(()=>cancellationPreview({...quote,...patch},id)).toThrow();
 });
 it('requires the receipt to match the reviewed amounts, currency and booking',()=>{
  expect(cancellationReceipt(receipt,quote).status).toBe('cancelled');
  for(const patch of [{refundMinor:'0'},{penaltyMinor:'2'},{currency:'USD'},{reservationId:quoteId},{status:'confirmed'},{refundStatus:'completed'},{idempotentReplay:'true'}])expect(()=>cancellationReceipt({...receipt,...patch},quote)).toThrow();
 });
 it('reuses an explicit command and quote after an uncertain response with authenticated no-store requests',async()=>{
  const fetch=vi.fn().mockRejectedValueOnce(new TypeError('lost response')).mockResolvedValueOnce(new Response(JSON.stringify({...receipt,idempotentReplay:true}),{status:200}));vi.stubGlobal('fetch',fetch);
  const key='10000000-0000-4000-8000-000000000004';
  await expect(guestCancellation.confirm(quote,'csrf',key)).rejects.toMatchObject({code:'GUEST_CORE_UNAVAILABLE'});
  expect(await guestCancellation.confirm(quote,'csrf',key)).toMatchObject({idempotentReplay:true});
  for(const [url,options] of fetch.mock.calls){expect(url).toBe('/guest-api/trips/'+id+'/cancellation/confirm');expect(options).toMatchObject({method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',body:JSON.stringify({quoteId}),headers:{'Idempotency-Key':key,'X-Views-Guest-Csrf':'csrf','X-Views-Guest-Pilot':'1'}});}
 });
});
