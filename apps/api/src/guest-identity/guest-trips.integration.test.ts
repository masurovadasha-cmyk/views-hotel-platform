import {beforeAll,beforeEach,afterAll,afterEach,describe,it,expect,vi} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {GuestEmailService} from './guest-email.service';
import {GuestEmailRegistry,type GuestEmailMessage} from './guest-email.registry';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {GuestTripsService,tripCursor} from './guest-trips.service';
const db=new DatabaseService(),registry=new GuestEmailRegistry(),messages:GuestEmailMessage[]=[];
registry.register({send:async m=>{messages.push(m);return {accepted:true};}});
const auth=new GuestEmailService(db,registry,new SecurityRateLimitService(db)),trips=new GuestTripsService(db,auth);
const org='00000000-0000-0000-0000-000000000001',property='00000000-0000-0000-0000-000000000002';
const org2='10000000-0000-4000-8000-000000000001',property2='10000000-0000-4000-8000-000000000002';
const run=(tenant:string,sql:string,values:unknown[]=[])=>db.withOrganization(tenant,c=>c.query(sql,values));
async function account(){
 const email='trips-'+randomUUID()+'@views.invalid',key=()=>randomBytes(32).toString('hex');
 const link=await auth.requestLink(email,'ru',key()),message=messages.find(m=>m.challengeId===link.challengeId)!;
 return {...await auth.exchange(link.challengeId,message.token,key()),email};
}
async function profile(userId:string|null,tenant=org,email='unrelated@views.invalid'){
 const id=randomUUID();await run(tenant,"INSERT INTO guest_profiles(id,user_id,organization_id,first_name,last_name,email,tags,vip_level) VALUES($1,$2,$3,'Private','Name',$4,ARRAY['private-tag'],'private-vip')",[id,userId,tenant,email]);return id;
}
async function book(guest:string,tenant=org,place=property,time='2037-05-01T12:00:00.123456Z'){
 const id=randomUUID();await run(tenant,`INSERT INTO reservations(id,organization_id,property_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,total_minor,cancellation_policy_snapshot,quote_snapshot)
 VALUES($1,$2,$3,$4,$5,'confirmed',$6::timestamptz,$6::timestamptz+interval '2 days','UZS',9007199254740993,'{"privatePolicy":"secret"}','{"privateInternal":"secret"}')`,[id,tenant,place,guest,'TRIP-'+id,time]);return id;
}
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_GUEST_EMAIL_PILOT_ENABLED','true');vi.stubEnv('VIEWS_GUEST_TRIPS_PILOT_ENABLED','true');vi.stubEnv('VIEWS_GUEST_EMAIL_TOKEN_KEY','ed'.repeat(32));});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('account-owned guest trips / PostgreSQL',()=>{
 it('reads only explicit owner profiles across organizations, never matching email or another guest',async()=>{
  const a=await account(),b=await account(),own=await book(await profile(a.userId));
  const second=await book(await profile(a.userId,org2),org2,property2);
  const foreign=await book(await profile(b.userId)),emailOnly=await book(await profile(null,org,a.email));
  expect(new Set((await trips.list(a.token)).items.map(i=>i.id))).toEqual(new Set([own,second]));
  for(const id of [foreign,emailOnly,randomUUID()])await expect(trips.detail(a.token,id)).rejects.toThrow('GUEST_TRIP_NOT_FOUND');
  expect((await trips.list(b.token)).items.map(i=>i.id)).toEqual([foreign]);
 });
 it('fails closed for legacy cross-organization guest or property references',async()=>{
  const a=await account(),guest=await profile(a.userId,org2);
  const wrongGuest=await book(guest),wrongProperty=await book(await profile(a.userId),org,property2);
  expect((await trips.list(a.token)).items).toEqual([]);
  for(const id of [wrongGuest,wrongProperty])await expect(trips.detail(a.token,id)).rejects.toThrow('GUEST_TRIP_NOT_FOUND');
 });
 it('paginates equal microsecond dates without duplicates or omissions, bounded at20',async()=>{
  const a=await account(),guest=await profile(a.userId),ids=[];
  for(let i=0;i<25;i++)ids.push(await book(guest));
  const first=await trips.list(a.token);expect(first.items).toHaveLength(20);expect(first.nextCursor).not.toBeNull();
  expect(tripCursor(first.nextCursor)[0]).toBe('2037-05-01T12:00:00.123456Z');
  const second=await trips.list(a.token,first.nextCursor);expect(second.items).toHaveLength(5);expect(second.nextCursor).toBeNull();
  expect([...first.items,...second.items].map(i=>i.id)).toEqual(ids.sort().reverse());
  const foreign=await account();expect((await trips.list(foreign.token,first.nextCursor)).items).toEqual([]);
 });
 it('projects exact minor money and excludes private guest, property and reservation fields',async()=>{
  const a=await account(),id=await book(await profile(a.userId)),result=await trips.detail(a.token,id);
  expect(result.trip.totalMinor).toBe('9007199254740993');
  expect(Object.keys(result.trip).sort()).toEqual(['id','confirmationCode','status','checkInAt','checkOutAt','currency','totalMinor','property'].sort());
  expect(JSON.stringify(result)).not.toMatch(/secret|private-|userId|guestId|organizationId|quoteSnapshot|cancellationPolicy/);
 });
 it('revokes reads immediately after profile unlink, session logout or email change',async()=>{
  const a=await account(),guest=await profile(a.userId),id=await book(guest);
  await run(org,'UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[guest]);
  await expect(trips.detail(a.token,id)).rejects.toThrow('GUEST_TRIP_NOT_FOUND');
  await auth.logout(a.token);await expect(trips.list(a.token)).rejects.toThrow('GUEST_EMAIL_SESSION_INVALID');
  await expect(db.query('SELECT * FROM app.guest_email_trips($1,NULL,NULL,NULL)',[createHash('sha256').update(a.token).digest('hex')])).rejects.toMatchObject({code:'28000'});
  const b=await account();await db.query('UPDATE users SET email=$1 WHERE id=$2',['changed-'+randomUUID()+'@views.invalid',b.userId]);
  await expect(trips.list(b.token)).rejects.toThrow('GUEST_EMAIL_SESSION_INVALID');
 });
 it('never trusts actor context over the bearer and adds no tenant-wide guest RLS access',async()=>{
  const a=await account(),id=await book(await profile(a.userId)),b=await account();
  expect((await db.query('SELECT id FROM reservations WHERE id=$1',[id])).rows).toEqual([]);
  const rows=await run(org,"SELECT * FROM app.guest_email_trips($1,NULL,NULL,$2)",[createHash('sha256').update(b.token).digest('hex'),id]);expect(rows.rows).toEqual([]);
  await expect(trips.list('vgs_'+'a'.repeat(43))).rejects.toThrow('GUEST_EMAIL_SESSION_INVALID');
  await expect(trips.list('a'.repeat(64))).rejects.toThrow('GUEST_EMAIL_SESSION_INVALID');
 });
 it('validates cursor shape and requires the default-off pilot',async()=>{
  const a=await account();for(const bad of ['',[],null,'%%%','a'.repeat(301),Buffer.from(JSON.stringify(['2037-02-31T12:00:00.123456Z',randomUUID()])).toString('base64url')])await expect(trips.list(a.token,bad)).rejects.toThrow('INVALID_GUEST_TRIP_CURSOR');
  await expect(trips.detail(a.token,'bad')).rejects.toThrow('GUEST_TRIP_NOT_FOUND');
  vi.stubEnv('VIEWS_GUEST_TRIPS_PILOT_ENABLED','false');await expect(trips.list(a.token)).rejects.toThrow('GUEST_TRIPS_DISABLED');
  vi.stubEnv('VIEWS_GUEST_TRIPS_PILOT_ENABLED','true');vi.stubEnv('NODE_ENV','production');await expect(trips.list(a.token)).rejects.toThrow('GUEST_EMAIL_DISABLED');
 });
});
