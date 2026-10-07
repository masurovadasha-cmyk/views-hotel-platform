import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {BookingWorkspaceController} from './booking-workspace.controller';
import {BookingStayService} from './booking-stay.service';
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002';
const actor={organizationId:org,userId:'20000000-0000-4000-8000-000000000001',membershipId:'73100000-0000-4000-8000-000000000001',requestId:'stay-proof'};
const db=new DatabaseService(),service=new BookingStayService(db),previous={...process.env};
let token:string;const type=randomUUID();
const query=(sql:string,args:unknown[]=[])=>db.withActor(actor,c=>c.query(sql,args));
async function session(){const raw=randomBytes(32).toString('hex');const result=await db.query('SELECT app.staff_auth_start($1,1,$2) ok',[actor.membershipId,createHash('sha256').update(raw).digest('hex')]);expect(result.rows[0].ok).toBe(true);return raw;}
async function fixture({marker=true,total='0',guest=true,future=false}={}){
 const id=randomUUID(),unit=randomUUID();
 await query("INSERT INTO units(id,property_id,unit_type_id,code) VALUES($1,$2,$3,$4)",[unit,property,type,'STAY-'+unit]);
 await query(`INSERT INTO reservations(id,organization_id,property_id,unit_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot,quote_snapshot)
 VALUES($1,$2,$3,$4,$5,'confirmed',clock_timestamp()+$6::interval,clock_timestamp()+interval '2 days','UZS',$7,'{}',$8)`,[id,org,property,unit,'STAY-'+id,future?'1 day':'-1 hour',total,{localStayPilot:marker}]);
 await query("INSERT INTO inventory_periods(organization_id,property_id,unit_id,kind,reservation_id,stay_period) SELECT organization_id,property_id,unit_id,'reservation',id,tstzrange(check_in_at,check_out_at,'[)') FROM reservations WHERE id=$1",[id]);
 if(guest)await query("INSERT INTO reservation_guests(organization_id,reservation_id,is_primary,first_name,last_name,date_of_birth,nationality_country_code) VALUES($1,$2,true,'Synthetic','Stay','2000-01-01','UZ')",[org,id]);
 return id;
}
const act=(id:string,action:'check-in'|'check-out',key=randomUUID(),sessionToken=token)=>service.transition(actor,sessionToken,id,key,action);
beforeAll(async()=>{
 Object.assign(process.env,{NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_STAY_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org});
 token=await session();await query("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{\"en\":\"Synthetic stay\"}',2)",[type,property]);
});
afterAll(async()=>{for(const k of Object.keys(process.env))if(!(k in previous))delete process.env[k];Object.assign(process.env,previous);await db.onModuleDestroy();});
describe.sequential('local synthetic stay transitions',()=>{
 it('requires pilot, live session and authorized property',async()=>{
  process.env.VIEWS_STAFF_STAY_PILOT_ENABLED='false';await expect(act(randomUUID(),'check-in')).rejects.toThrow('STAY_PILOT_DISABLED');process.env.VIEWS_STAFF_STAY_PILOT_ENABLED='true';
  process.env.NODE_ENV='production';await expect(act(randomUUID(),'check-in')).rejects.toThrow('STAY_PILOT_DISABLED');process.env.NODE_ENV='test';
  await expect(act(randomUUID(),'check-in',randomUUID(),'0'.repeat(64))).rejects.toThrow('STAFF_SESSION_REQUIRED');
  await expect(act(randomUUID(),'check-in')).rejects.toThrow('PROPERTY_FORBIDDEN');
 });
 it('rejects ordinary or priced reservations, absent guest and early arrival',async()=>{
  await expect(act(await fixture({marker:false}),'check-in')).rejects.toThrow('STAY_FIXTURE_REQUIRED');
  await expect(act(await fixture({total:'100'}),'check-in')).rejects.toThrow('STAY_FIXTURE_REQUIRED');
  await expect(act(await fixture({guest:false}),'check-in')).rejects.toThrow('STAY_GUEST_REQUIRED');
  await expect(act(await fixture({future:true}),'check-in')).rejects.toThrow('STAY_OUTSIDE_ARRIVAL_WINDOW');
 });
 it('concurrent repeats commit once; checkout preserves history and frees future inventory',async()=>{
  const id=await fixture(),key=randomUUID();const results=await Promise.all([act(id,'check-in',key),act(id,'check-in',key)]);
  expect(results.filter(r=>r.idempotentReplay)).toHaveLength(1);
  expect((await query('SELECT version,status FROM reservations WHERE id=$1',[id])).rows[0]).toEqual({version:2,status:'checked_in'});
  await expect(act(id,'check-in')).rejects.toThrow('STAY_STATE_CHANGED');
  const outKey=randomUUID();await act(id,'check-out',outKey);expect((await act(id,'check-out',outKey)).idempotentReplay).toBe(true);
  const period=(await query('SELECT lower(stay_period)<upper(stay_period) history,upper(stay_period)<=clock_timestamp() released FROM inventory_periods WHERE reservation_id=$1',[id])).rows[0];expect(period).toEqual({history:true,released:true});
  expect((await query("SELECT count(*)::int n FROM booking_state_events WHERE reservation_id=$1 AND event_type IN ('booking.checked_in','booking.checked_out')",[id])).rows[0].n).toBe(2);
  expect((await query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action LIKE 'staff.local_checked%'",[id])).rows[0].n).toBe(2);
  await expect(act(await fixture(),'check-in',key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
 });
 it('outbox failure rolls back status, inventory, command and audit',async()=>{
  const id=await fixture(),key=randomUUID();await act(id,'check-in');
  await query("INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES($1,'reservation',$2,'fixture.collision',$3,'{}')",[org,id,'stay:'+org+':local_check-out:'+key]);
  await expect(act(id,'check-out',key)).rejects.toThrow();
  expect((await query('SELECT status,version FROM reservations WHERE id=$1',[id])).rows[0]).toEqual({status:'checked_in',version:2});
  expect((await query('SELECT upper(stay_period)>clock_timestamp() retained FROM inventory_periods WHERE reservation_id=$1',[id])).rows[0].retained).toBe(true);
  expect((await query("SELECT count(*)::int n FROM booking_commands WHERE reservation_id=$1 AND command_type='local_check-out'",[id])).rows[0].n).toBe(0);
 });
 it('projects guest and blockers only for eligible synthetic stays',async()=>{
  const controller=new BookingWorkspaceController(db);
  const headers={'x-organization-id':org,'x-user-id':actor.userId,'x-membership-id':actor.membershipId};
  const ready=await fixture(),missing=await fixture({guest:false}),normal=await fixture({marker:false});
  const board=await controller.read(headers,property,'today');if(!('arrivals' in board))throw Error('MISSING_BOARD');
  const get=(id:string)=>board.arrivals.items.find((r:{reservationId:string})=>r.reservationId===id);
  expect(get(ready).readiness).toEqual({primaryGuest:'Synthetic Stay',unitActive:true,inventoryValid:true,paymentFree:true,timeAllowed:true,unitVacant:true});
  expect(get(missing).readiness.primaryGuest).toBeNull();expect(get(normal).readiness).toBeNull();
  await query('DELETE FROM inventory_periods WHERE reservation_id=$1',[ready]);
  const next=await controller.read(headers,property,'today');if(!('arrivals' in next))throw Error('MISSING_BOARD');
  expect(next.arrivals.items.find((r:{reservationId:string})=>r.reservationId===ready).readiness.inventoryValid).toBe(false);
  await expect(act(ready,'check-in')).rejects.toThrow('STAY_INVENTORY_INVALID');
 });
 it('saves primary guest atomically, replays once and rejects stale or changed requests',async()=>{
  const id=await fixture({guest:false}),key=randomUUID();
  const guest={firstName:'Test',lastName:'Guest',dateOfBirth:'2000-02-29',nationality:'UZ',expectedVersion:1};
  const save=(body=guest,k=key)=>service.transition(actor,token,id,k,'guest',body);
  const results=await Promise.all([save(),save()]);expect(results.filter(r=>r.idempotentReplay)).toHaveLength(1);
  expect((await query('SELECT first_name FROM reservation_guests WHERE reservation_id=$1',[id])).rows).toEqual([{first_name:'Test'}]);
  await expect(save({...guest,firstName:'Changed'})).rejects.toThrow('IDEMPOTENCY_CONFLICT');
  await expect(save(guest,randomUUID())).rejects.toThrow('GUEST_VERSION_CHANGED');
  await expect(save({...guest,dateOfBirth:'2001-02-29'},randomUUID())).rejects.toThrow('INVALID_GUEST');
  await expect(service.transition(actor,token,await fixture({marker:false}),randomUUID(),'guest',guest)).rejects.toThrow('STAY_FIXTURE_REQUIRED');
  const failKey=randomUUID();await query("INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES($1,'reservation',$2,'fixture.collision',$3,'{}')",[org,id,'stay:'+org+':local_guest:'+failKey]);
  await expect(save({...guest,firstName:'Rollback',expectedVersion:2},failKey)).rejects.toThrow();
  expect((await query('SELECT first_name FROM reservation_guests WHERE reservation_id=$1',[id])).rows[0].first_name).toBe('Test');
  expect((await query('SELECT version FROM reservations WHERE id=$1',[id])).rows[0].version).toBe(2);
  await save({...guest,lastName:'Updated',expectedVersion:2},randomUUID());
  expect((await query('SELECT last_name FROM reservation_guests WHERE reservation_id=$1',[id])).rows[0].last_name).toBe('Updated');
  const audit=(await query("SELECT after_state FROM audit_log WHERE entity_id=$1 AND action='staff.local_guest_updated'",[id])).rows;expect(audit).toHaveLength(2);expect(JSON.stringify(audit)).not.toContain('Updated');
  await act(id,'check-in');await expect(save({...guest,expectedVersion:4},randomUUID())).rejects.toThrow('STAY_STATE_CHANGED');
 });
 it('refuses changes to a guest with document records',async()=>{
  const id=await fixture();
  await query("INSERT INTO guest_document_records(organization_id,reservation_guest_id,document_type,storage_region,vault_id,object_key) SELECT organization_id,id,'passport','UZ','synthetic','synthetic/not-an-upload' FROM reservation_guests WHERE reservation_id=$1",[id]);
  await expect(service.transition(actor,token,id,randomUUID(),'guest',{firstName:'Test',lastName:'Guest',dateOfBirth:'2000-01-01',nationality:'UZ',expectedVersion:1})).rejects.toThrow('GUEST_DOCUMENT_REVIEW_REQUIRED');
  expect((await query('SELECT version FROM reservations WHERE id=$1',[id])).rows[0].version).toBe(1);
 });
 it('revocation blocks later transitions even with a previously valid session',async()=>{
  const old=await session(),id=await fixture();await db.query('SELECT app.staff_auth_logout($1,false)',[createHash('sha256').update(old).digest('hex')]);
  await expect(act(id,'check-in',randomUUID(),old)).rejects.toThrow('STAFF_SESSION_REQUIRED');
 });
});
