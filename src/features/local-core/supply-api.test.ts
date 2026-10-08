import {afterEach,describe,expect,it,vi} from 'vitest';
import {supplyApi,supplyCommandResult,supplyQuantity,type SupplyCommand} from './supply-api';
const propertyId='10000000-0000-4000-8000-000000000001',itemId='10000000-0000-4000-8000-000000000002',key='10000000-0000-4000-8000-000000000003';
afterEach(()=>vi.unstubAllGlobals());
const answer=(body:unknown)=>new Response(JSON.stringify(body),{status:200});
describe('supply UI command and stock boundary',()=>{
 it('preserves exact physical integer quantities and rejects fractions, zero and bigint overflow',()=>{
  expect(supplyQuantity('9007199254740993')).toBe('9007199254740993');expect(supplyQuantity('9223372036854775807')).toBe('9223372036854775807');
  for(const value of ['0','-1','1.5','1e4','01',' 1','9223372036854775808'])expect(()=>supplyQuantity(value)).toThrow();
 });
 it('requires issue receipts to match the requested item and quantity with a nonnegative balance',()=>{
  const command:SupplyCommand={kind:'issue',key,body:{propertyId,itemId,quantity:'9007199254740993',reference:'Synthetic linen issue'}};
  const receipt={movementId:key,itemId,quantity:'9007199254740993',remainingQuantity:'2',idempotentReplay:true};
  expect(supplyCommandResult(receipt,command).remainingQuantity).toBe('2');
  for(const patch of [{itemId:propertyId},{quantity:'1'},{remainingQuantity:'-1'},{remainingQuantity:2},{movementId:''},{idempotentReplay:'true'}])expect(()=>supplyCommandResult({...receipt,...patch},command)).toThrow();
 });
 it('does not claim receipt of a different order or a still-ordered response',()=>{
  const command:SupplyCommand={kind:'receive',key,orderId:propertyId,body:{}};
  expect(supplyCommandResult({orderId:propertyId,receiptId:key,status:'received',idempotentReplay:false},command).status).toBe('received');
  for(const receipt of [{orderId:itemId,receiptId:key,status:'received',idempotentReplay:false},{orderId:propertyId,receiptId:key,status:'ordered',idempotentReplay:false}])expect(()=>supplyCommandResult(receipt,command)).toThrow();
 });
 it('rejects negative stock and an issue movement incorrectly presented as incoming stock',async()=>{
  const item={itemId,sku:'LINEN',name:'Synthetic linen',unit:'piece',quantity:'-1'};
  const fetch=vi.fn().mockResolvedValueOnce(answer({items:[item],nextCursor:null})).mockResolvedValueOnce(answer({items:[{...item,id:key,quantity:'1',kind:'issue',reference:'Synthetic',createdAt:'2026-01-01T10:00:00Z'}],nextCursor:null}));vi.stubGlobal('fetch',fetch);
  await expect(supplyApi.stock('csrf',propertyId)).rejects.toThrow('SUPPLY_INVALID_RESPONSE');await expect(supplyApi.movements('csrf',propertyId)).rejects.toThrow('SUPPLY_INVALID_RESPONSE');
 });
 it('retries a lost purchase response using the exact original key and lines without an automatic resend',async()=>{
  const command:SupplyCommand={kind:'order',key,body:{propertyId,reference:'Synthetic order',lines:[{itemId,quantity:'9007199254740993'}]}};
  const fetch=vi.fn().mockRejectedValueOnce(new TypeError('lost response')).mockResolvedValueOnce(answer({orderId:propertyId,status:'ordered',idempotentReplay:true}));vi.stubGlobal('fetch',fetch);
  await expect(supplyApi.execute('csrf',command)).rejects.toThrow();expect(fetch).toHaveBeenCalledTimes(1);await expect(supplyApi.execute('csrf',command)).resolves.toMatchObject({idempotentReplay:true});
  for(const [url,options] of fetch.mock.calls){expect(url).toBe('/local-api/supply/orders');expect(options).toMatchObject({credentials:'same-origin',method:'POST',body:JSON.stringify(command.body),headers:{'Idempotency-Key':key,'X-CSRF-Token':'csrf'}});}
 });
});
