import {afterEach,describe,expect,it,vi} from 'vitest';
import {supplyApi,supplyCommandResult,supplyQuantity,supplyCount,supplyStocktakePreview,type SupplyCommand} from './supply-api';
import {supplyDefinitive} from './SupplyWorkspaceLocale';
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
 it('requires coherent partial receipt quantities and accepts only the explicit partial command result',async()=>{
  const line={itemId,sku:'LINEN',name:'Synthetic linen',unit:'piece',quantity:'10',receivedQuantity:'4',remainingQuantity:'6'};
  const order={id:propertyId,reference:'Synthetic',status:'partially_received',createdAt:'2026-01-01T10:00:00Z',lines:[line]};
  const fetch=vi.fn().mockResolvedValueOnce(answer({items:[order],nextCursor:null})).mockResolvedValueOnce(answer({items:[{...order,lines:[{...line,remainingQuantity:'7'}]}],nextCursor:null})).mockResolvedValueOnce(answer({items:[{...order,status:'received'}],nextCursor:null}));vi.stubGlobal('fetch',fetch);
  expect((await supplyApi.orders('csrf',propertyId)).items[0].lines[0].remainingQuantity).toBe('6');
  await expect(supplyApi.orders('csrf',propertyId)).rejects.toThrow('SUPPLY_INVALID_RESPONSE');await expect(supplyApi.orders('csrf',propertyId)).rejects.toThrow('SUPPLY_INVALID_RESPONSE');
  const receipt={orderId:propertyId,receiptId:key,status:'partially_received',idempotentReplay:true};
  expect(supplyCommandResult(receipt,{kind:'receive',key,orderId:propertyId,body:{lines:[{itemId,quantity:'4'}]}}).status).toBe('partially_received');
  expect(()=>supplyCommandResult(receipt,{kind:'receive',key,orderId:propertyId,body:{}})).toThrow();
 });
 it('validates physical stock counts including zero and binds confirmation to the reviewed balance and delta',()=>{
  expect(supplyCount('0')).toBe('0');expect(()=>supplyQuantity('0')).toThrow();expect(()=>supplyCount('-1')).toThrow();
  const input={propertyId,itemId,countedQuantity:'0',reason:'Synthetic physical count'};
  const preview={...input,sku:'LINEN',name:'Synthetic linen',unit:'piece',expectedQuantity:'9007199254740993',deltaQuantity:'-9007199254740993',expectedRevision:'3'};
  expect(supplyStocktakePreview(preview,input).expectedQuantity).toBe('9007199254740993');
  for(const patch of [{propertyId:itemId},{countedQuantity:'1'},{deltaQuantity:'-1'},{expectedRevision:-1},{reason:'Other'}])expect(()=>supplyStocktakePreview({...preview,...patch},input)).toThrow();
  const command:SupplyCommand={kind:'stocktake',key,body:{...input,expectedQuantity:preview.expectedQuantity,expectedRevision:preview.expectedRevision}};
  const receipt={propertyId,itemId,stocktakeId:key,movementId:key,quantity:'0',remainingQuantity:'0',deltaQuantity:preview.deltaQuantity,idempotentReplay:true};
  expect(supplyCommandResult(receipt,command).quantity).toBe('0');
  for(const patch of [{remainingQuantity:'1'},{quantity:'1'},{deltaQuantity:'0'},{propertyId:itemId},{movementId:null}])expect(()=>supplyCommandResult({...receipt,...patch},command)).toThrow();
  expect(supplyDefinitive(new Error('STOCKTAKE_STALE'))).toBe(true);expect(supplyDefinitive(new Error('RECEIPT_QUANTITY_EXCEEDED'))).toBe(true);
 });
 it('shows signed and zero stocktake adjustments without relaxing receipt or issue direction',async()=>{
  const base={id:key,itemId,sku:'LINEN',name:'Synthetic linen',unit:'piece',kind:'adjustment',reference:'Synthetic count',createdAt:'2026-01-01T10:00:00Z'};
  const fetch=vi.fn().mockResolvedValueOnce(answer({items:['-2','0','3'].map(quantity=>({...base,quantity})),nextCursor:null})).mockResolvedValueOnce(answer({items:[{...base,kind:'issue',quantity:'0'}],nextCursor:null}));vi.stubGlobal('fetch',fetch);
  expect((await supplyApi.movements('csrf',propertyId)).items.map(item=>item.quantity)).toEqual(['-2','0','3']);await expect(supplyApi.movements('csrf',propertyId)).rejects.toThrow('SUPPLY_INVALID_RESPONSE');
 });

});
