import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';
import {OperationsQueueService,queueQuery,queueRow} from './operations-queue.service';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor={organizationId:id(1),userId:id(2),membershipId:id(3),requestId:id(4)};
const base={orderId:id(10),stage:'requested',revision:1,unitCode:'235',responseDueAt:'2026-10-25T09:00:00Z',answeredAt:null};
function harness(allowed=true,items:Record<string,unknown>[]=[base]){
 const query=vi.fn(async(sql:string,_params?:unknown[])=>{if(sql.startsWith('SET '))return {rows:[]};if(sql.includes('registry_access'))return {rows:[{allowed}]};return {rows:[{value:{items}}]};});
 const db={withActor:vi.fn(async(_:unknown,f:(c:{query:typeof query})=>unknown)=>f({query}))};
 const staff={resolve:vi.fn(async()=>({...actor}))};
 const service=new OperationsQueueService(db as never,staff as never);return {service,query,db,staff};
}
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_SERVICE_ORDER_PILOT_ENABLED','true');vi.stubEnv('VIEWS_MARKET_PILOT_ENABLED','true');});
afterEach(()=>vi.unstubAllEnvs());
describe('minimal read-only operations queue',()=>{
 it.each([{kind:'bad'},{kind:['market']},{cursor:id(1)},{kind:'market',cursor:'bad'},{limit:999},{propertyId:[id(1)]}])('rejects malformed or broadened input %j',extra=>expect(()=>queueQuery({propertyId:id(1),...extra})).toThrow());
 it('projects no guest, messages, money, assignment or arbitrary source fields',()=>{
  expect(queueRow('cleaning',{...base,guestEmail:'secret',messages:[1],totalMinor:'100',assignedMembershipId:id(99)},new Date())).toEqual({id:id(10),kind:'cleaning',stage:'requested',revision:1,unitCode:'235',sla:null});
 });
 it('uses intake ID, not resulting service-order ID, for laundry cursor',()=>expect(queueRow('laundry',{...base,intakeId:id(20)},new Date()).id).toBe(id(20)));
 it('uses only existing concierge SLA and rejects corrupt receipts',()=>{
  expect(queueRow('concierge',base,new Date('2026-10-25T09:01:00Z')).sla).toMatchObject({state:'overdue',overdueSeconds:60,hypothesis:true});
  expect(()=>queueRow('concierge',{...base,responseDueAt:'bad'},new Date())).toThrow();
  expect(()=>queueRow('market',{...base,revision:0},new Date())).toThrow();
 });
 it('does not query source functions or counts when access is absent',async()=>{
  const h=harness(false);expect((await h.service.list(actor,'token',{propertyId:id(5)})).sections).toEqual(['cleaning','laundry','market','concierge'].map(kind=>({kind,status:'forbidden',items:[],nextCursor:null})));
  expect(h.query.mock.calls.filter(([sql])=>sql.includes('_list(')||sql.includes('_queue('))).toHaveLength(0);
 });
 it('binds actor organization, requested property and hashed session; preserves newest-first source order',async()=>{
  const rows=Array.from({length:51},(_,i)=>({...base,orderId:id(100-i)}));const h=harness(true,rows);
  const result=await h.service.list(actor,'test-session',{propertyId:id(5),kind:'market',cursor:id(101)});
  expect(result.sections[0].items[0].id).toBe(id(100));expect(result.sections[0].items).toHaveLength(50);expect(result.sections[0].nextCursor).toBe(id(51));
  expect(h.db.withActor.mock.calls[0][0]).toEqual(actor);
  const call=h.query.mock.calls.find(([sql])=>sql.includes('market_staff_list'))! as unknown as [string,unknown[]];
  expect(call[1][0]).not.toBe('test-session');expect(call[1].slice(1)).toEqual([id(5),id(101)]);
 });
 it('laundry keyset preserves server order, with no speculative extra rows',async()=>{
  const h=harness(true,[1,2,3].map(n=>({...base,intakeId:id(n)})));
  const result=await h.service.list(actor,'token',{propertyId:id(5),kind:'laundry'});
  expect(result.sections[0].items.map(r=>r.id)).toEqual([id(1),id(2)]);expect(result.sections[0].nextCursor).toBe(id(2));
 });
 it('rejects cross-actor and revoked sessions before reading data',async()=>{
  const h=harness();h.staff.resolve.mockResolvedValueOnce({...actor,organizationId:id(99)});await expect(h.service.list(actor,'token',{propertyId:id(5)})).rejects.toThrow('STAFF_ACTOR_MISMATCH');expect(h.db.withActor).not.toHaveBeenCalled();
  h.staff.resolve.mockRejectedValueOnce(Error('REVOKED'));await expect(h.service.list(actor,'token',{propertyId:id(5)})).rejects.toThrow('REVOKED');expect(h.db.withActor).not.toHaveBeenCalled();
 });
 it('does not suppress permission revocation during authoritative source read',async()=>{
  const h=harness();h.query.mockImplementation(async sql=>{if(sql.includes('staff_cleaning_queue'))throw Object.assign(Error('SERVICE_FORBIDDEN'),{code:'42501'});return {rows:[{allowed:true}]} as never;});
  await expect(h.service.list(actor,'token',{propertyId:id(5)})).rejects.toThrow('SERVICE_FORBIDDEN');
 });
 it('does not activate market pilot or service rehearsal',async()=>{
  const h=harness();vi.stubEnv('VIEWS_MARKET_PILOT_ENABLED','false');expect((await h.service.list(actor,'token',{propertyId:id(5),kind:'market'})).sections[0].status).toBe('disabled');
  vi.stubEnv('VIEWS_LOCAL_REHEARSAL','false');await expect(h.service.list(actor,'token',{propertyId:id(5)})).rejects.toThrow('SERVICE_ORDERS_DISABLED');
 });
});
