import {afterEach,describe,expect,it,vi} from 'vitest';
import {definitiveFolioError,folioError} from './FolioWorkspaceLocale';
import {translate} from '../../i18n/messages';
import catalog from './folio-workspace-translations.json';
import {folioApi,folioMoney,majorToMinor,parseAuditPreview,parseAuditReceipt,parseFolioDetail,parseFolioPage,type AuditPreview,type FolioDetail} from './folio-workspace-api';
const id='10000000-0000-4000-8000-000000000001',propertyId='10000000-0000-4000-8000-000000000002';
const summary={id:null,reservationId:id,confirmationCode:'TEST',currency:'UZS',status:'not_opened' as const,balanceMinor:'90071992547409931234',entryCount:0};
const detail:FolioDetail={folio:summary,items:[],nextCursor:null,accountingMode:'operational_charges'};
const preview:AuditPreview={propertyId,businessDate:'2026-01-01',timezone:'Asia/Tashkent',revision:'a'.repeat(64),run:null,eligibleCount:500,unresolvedCount:0,invalidSnapshotCount:0,scopeChanged:false,accountingMode:'operational_charges'};
afterEach(()=>vi.unstubAllGlobals());
describe('folio financial UI boundary',()=>{
 it('stops retrying a refused reversal while preserving uncertain retries, with three localized explanations',()=>{
  const refusal=new Error('FOLIO_REVERSAL_NOT_ALLOWED'),unknown=new Error('CORE_UNAVAILABLE');
  expect(definitiveFolioError(refusal)).toBe(true);expect(definitiveFolioError(unknown)).toBe(false);
  expect(folioError(refusal)).not.toBe(folioError(unknown));
  const messages=(['ru','uz','en'] as const).map(locale=>translate(catalog,locale,folioError(refusal)));
  expect(new Set(messages).size).toBe(3);expect(messages.every(message=>message.length>20&&!message.includes('FOLIO_'))).toBe(true);
 });
 it('converts major units without Number rounding and rejects invalid/overflow charges',()=>{
  expect(majorToMinor('9007199254740993.12')).toBe('900719925474099312');expect(majorToMinor('12,5')).toBe('1250');
  for(const amount of ['0','-1','1.001','1e8','92233720368547758.08',' 1','NaN'])expect(()=>majorToMinor(amount)).toThrow();
  expect(folioMoney('-900719925474099312','UZS','en')).toBe('−9,007,199,254,740,993.12 UZS');
 });
 it('preserves aggregate money above bigint range but rejects numeric responses or foreign folios',()=>{
  expect(parseFolioPage({items:[summary],nextCursor:null,accountingMode:'operational_charges'}).items[0].balanceMinor).toBe('90071992547409931234');
  expect(parseFolioDetail(detail,id).folio.id).toBeNull();
  expect(()=>parseFolioDetail(detail,propertyId)).toThrow();
  expect(()=>parseFolioPage({items:[{...summary,balanceMinor:1 as unknown as string}],nextCursor:null,accountingMode:'operational_charges'})).toThrow();
  expect(()=>parseFolioDetail({...detail,items:[{id,kind:'service',amountMinor:'-100',label:{ru:{} as string},createdAt:'2026-01-01',reversalOf:null,reversed:false,sourceType:'manual_charge'}]},id)).toThrow();
 });
 it('binds audit previews and receipts to the chosen property/date and exact revision',()=>{
  expect(parseAuditPreview(preview,propertyId,'2026-01-01').eligibleCount).toBe(500);
  for(const patch of [{propertyId:id},{businessDate:'2026-01-02'},{revision:'missing'},{eligibleCount:-1},{timezone:'invalid'},{invalidSnapshotCount:-1},{scopeChanged:null as unknown as boolean}])expect(()=>parseAuditPreview({...preview,...patch},propertyId,'2026-01-01')).toThrow();
  const receipt={runId:id,propertyId,businessDate:'2026-01-01',reservationCount:500,postedCount:500,zeroAmountCount:0,totals:[{currency:'UZS',amountMinor:'90071992547409931234'}],idempotentReplay:true,accountingMode:'operational_charges' as const};
  expect(parseAuditReceipt(receipt,propertyId,'2026-01-01').totals[0].amountMinor).toBe('90071992547409931234');
  expect(()=>parseAuditReceipt({...receipt,businessDate:'2026-01-02'},propertyId,'2026-01-01')).toThrow();
 });
 it('retains the manual charge command body/key on an explicit retry after a lost response',async()=>{
  const body={kind:'service' as const,amountMinor:'10001',label:'Synthetic laundry'},key='10000000-0000-4000-8000-000000000003';
  const fetch=vi.fn().mockRejectedValueOnce(new TypeError('lost response')).mockResolvedValueOnce(new Response(JSON.stringify({entryId:key,folioId:propertyId,reservationId:id,idempotentReplay:true})));vi.stubGlobal('fetch',fetch);
  await expect(folioApi.entry('csrf',id,'charges',body,key)).rejects.toThrow();await expect(folioApi.entry('csrf',id,'charges',body,key)).resolves.toMatchObject({idempotentReplay:true});
  expect(fetch).toHaveBeenCalledTimes(2);for(const [url,options] of fetch.mock.calls){expect(url).toBe('/local-api/folios/reservations/'+id+'/charges');expect(options).toMatchObject({credentials:'same-origin',method:'POST',body:JSON.stringify(body),headers:{'Idempotency-Key':key,'X-CSRF-Token':'csrf'}});}
 });
});
