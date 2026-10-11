import {beforeAll,beforeEach,afterAll,afterEach,describe,it,expect,vi} from 'vitest';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {GuestEmailRegistry,type GuestEmailMessage} from './guest-email.registry';
import {GuestEmailService} from './guest-email.service';
import {GuestReservationLinkService} from './guest-reservation-link.service';
import {GuestTripsService} from './guest-trips.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
const db=new DatabaseService(),registry=new GuestEmailRegistry(),messages:GuestEmailMessage[]=[];
registry.register({send:async m=>{messages.push(m);return {accepted:true};}});
const limits=new SecurityRateLimitService(db),guest=new GuestEmailService(db,registry,limits),staff=new StaffAuthService(db),links=new GuestReservationLinkService(db,staff,guest,limits),trips=new GuestTripsService(db,guest);
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',member='73100000-0000-4000-8000-000000000001';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');let staffToken:string;
const query=(sql:string,p:unknown[]=[])=>db.withOrganization(org,c=>c.query(sql,p));
async function account(){const email='link-'+randomUUID()+'@views.invalid',link=await guest.requestLink(email,'en',randomBytes(32).toString('hex'));return {...await guest.exchange(link.challengeId,messages.find(m=>m.challengeId===link.challengeId)!.token,randomBytes(32).toString('hex')),email};}
async function booking(profile?:string){
 const id=randomUUID(),guestId=profile||randomUUID();
 if(!profile)await query("INSERT INTO guest_profiles(id,organization_id,first_name,last_name) VALUES($1,$2,'Synthetic','Link')",[guestId,org]);
 await query("INSERT INTO reservations(id,organization_id,property_id,primary_guest_id,confirmation_code,status,check_in_at,check_out_at,currency,cancellation_policy_snapshot) VALUES($1,$2,$3,$4,$5,'confirmed','2037-06-01','2037-06-03','UZS','{}')",[id,org,property,guestId,'LINK-'+id]);return {id,guestId};
}
beforeAll(async()=>{
 expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST');
 staffToken=randomBytes(32).toString('hex');expect((await db.query('SELECT app.staff_auth_start($1,1,$2) ok',[member,hash(staffToken)])).rows[0].ok).toBe(true);
});
beforeEach(()=>{for(const [k,v] of Object.entries({NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_GUEST_EMAIL_PILOT_ENABLED:'true',VIEWS_GUEST_TRIPS_PILOT_ENABLED:'true',VIEWS_GUEST_LINK_PILOT_ENABLED:'true',VIEWS_GUEST_EMAIL_TOKEN_KEY:'ab'.repeat(32),VIEWS_GUEST_LINK_TOKEN_KEY:'cd'.repeat(32),VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org}))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('reservation-scoped guest association',()=>{
 it('requires recipient session and explicit acceptance; grants one stay, never its shared profile',async()=>{
  const a=await account(),b=await account(),r=await booking(),other=await booking(r.guestId),issued=await links.issue(staffToken,r.id,a.email,randomUUID());
  await expect(links.use(b.token,issued.token,false)).rejects.toThrow('GUEST_LINK_INVALID');
  expect((await links.use(a.token,issued.token,false)).accepted).toBe(false);expect((await trips.list(a.token)).items).toEqual([]);
  await links.use(a.token,issued.token,true);expect((await trips.list(a.token)).items.map(x=>x.id)).toEqual([r.id]);
  await expect(trips.detail(a.token,other.id)).rejects.toThrow('GUEST_TRIP_NOT_FOUND');
  expect((await query('SELECT user_id FROM guest_profiles WHERE id=$1',[r.guestId])).rows[0].user_id).toBeNull();
  const restored=await links.inspect(staffToken,r.id) as {invitation:{linkId:string;status:string;token?:string}};expect(restored.invitation.linkId).toBe(issued.linkId);expect(restored.invitation.status).toBe('accepted');expect(restored.invitation.token).toBeUndefined();
  await links.revoke(staffToken,r.id,issued.linkId);await links.revoke(staffToken,r.id,issued.linkId);
  expect((await trips.list(a.token)).items).toEqual([]);await expect(links.use(a.token,issued.token,true)).rejects.toThrow('GUEST_LINK_INVALID');
 });
 it('serializes parallel acceptance and records one audit/outbox event; retries are safe',async()=>{
  const a=await account(),r=await booking(),issued=await links.issue(staffToken,r.id,a.email,randomUUID());
  const results=await Promise.all(Array.from({length:5},()=>links.use(a.token,issued.token,true)));expect(results.every(x=>x.accepted)).toBe(true);
  expect((await query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action='guest_link.accepted'",[r.id])).rows[0].n).toBe(1);
  expect((await query("SELECT count(*)::int n FROM outbox_events WHERE aggregate_id=$1 AND event_type='guest.reservation_linked'",[r.id])).rows[0].n).toBe(1);
 });
 it('replays issuance without extending validity, rejects key collisions, and supersedes pending invitations',async()=>{
  const a=await account(),r=await booking(),key=randomUUID(),one=await links.issue(staffToken,r.id,a.email,key),two=await links.issue(staffToken,r.id,a.email,key);
  expect(two).toEqual({...one,replayed:true});
  await expect(links.issue(staffToken,(await booking()).id,a.email,key)).rejects.toThrow('GUEST_LINK_COMMAND_CONFLICT');
  const fresh=await links.issue(staffToken,r.id,a.email,randomUUID());await expect(links.use(a.token,one.token,true)).rejects.toThrow('GUEST_LINK_INVALID');
  await links.use(a.token,fresh.token,true);await expect(links.issue(staffToken,r.id,a.email,randomUUID())).rejects.toThrow('GUEST_LINK_NOT_ELIGIBLE');
 });
 it('denies changed primary guest, untrusted staff, foreign property and direct private-table access',async()=>{
  const a=await account(),r=await booking(),issued=await links.issue(staffToken,r.id,a.email,randomUUID());
  await query('UPDATE reservations SET primary_guest_id=$1 WHERE id=$2',[(await booking()).guestId,r.id]);await expect(links.use(a.token,issued.token,true)).rejects.toThrow('GUEST_LINK_INVALID');
  await expect(links.issue(a.token,r.id,a.email,randomUUID())).rejects.toThrow('STAFF_SESSION_REQUIRED');
  await expect(links.issue(staffToken,randomUUID(),a.email,randomUUID())).rejects.toThrow('GUEST_LINK_STAFF_DENIED');
  const badScope=await booking();await query('UPDATE reservations SET property_id=$1 WHERE id=$2',['00000000-0000-0000-0000-000000000002',badScope.id]);
  await expect(links.issue(staffToken,badScope.id,a.email,randomUUID())).rejects.toThrow('GUEST_LINK_STAFF_DENIED');
  await expect(db.query('SELECT * FROM guest_identity_private.reservation_links')).rejects.toMatchObject({code:'42501'});
 });
 it('rolls back grant and audit when outbox insertion fails',async()=>{
  const a=await account(),r=await booking(),issued=await links.issue(staffToken,r.id,a.email,randomUUID());
  await query("INSERT INTO outbox_events(organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload) VALUES($1,'reservation',$2,'fixture.collision',$3,'{}')",[org,r.id,'guest-link:'+issued.linkId]);
  await expect(links.use(a.token,issued.token,true)).rejects.toThrow();expect((await trips.list(a.token)).items).toEqual([]);
  expect((await links.use(a.token,issued.token,false)).accepted).toBe(false);
  expect((await query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action='guest_link.accepted'",[r.id])).rows[0].n).toBe(0);
 });
 it('limits guessing per account and keeps pilot off outside isolated tests',async()=>{
  const a=await account();for(let i=0;i<30;i++)await expect(links.use(a.token,'vglk_'+'x'.repeat(43),false)).rejects.toThrow('GUEST_LINK_INVALID');
  await expect(links.use(a.token,'vglk_'+'x'.repeat(43),false)).rejects.toThrow('RATE_LIMITED');
  vi.stubEnv('VIEWS_GUEST_LINK_PILOT_ENABLED','false');await expect(links.use(a.token,'x',false)).rejects.toThrow('GUEST_LINK_DISABLED');
  vi.stubEnv('VIEWS_GUEST_LINK_PILOT_ENABLED','true');vi.stubEnv('NODE_ENV','production');await expect(links.use(a.token,'x',false)).rejects.toThrow('GUEST_LINK_DISABLED');
 });
});
