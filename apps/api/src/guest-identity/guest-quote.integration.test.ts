import {beforeAll,beforeEach,afterAll,afterEach,it,expect,vi} from 'vitest';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {GuestIdentityService} from './guest-identity.service';
import {GuestSmsRegistry,GuestSmsMessage} from './guest-sms.registry';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {StaffAuthService} from '../staff-auth/staff-auth.service';
import {GuestQuoteService} from './guest-quote.service';
const db=new DatabaseService(),sms=new GuestSmsRegistry(),messages:GuestSmsMessage[]=[];
sms.register({send:async m=>{messages.push(m);}});
const auth=new GuestIdentityService(db,sms,new SecurityRateLimitService(db)),offers=new GuestQuoteService(db,new StaffAuthService(db),auth);
const org='10000000-0000-4000-8000-000000000001',property='10000000-0000-4000-8000-000000000002',member='73100000-0000-4000-8000-000000000001';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');let staffToken:string;
const query=(sql:string,args:unknown[]=[])=>db.withOrganization(org,c=>c.query(sql,args));
async function account(){
 const key=()=>randomBytes(32).toString('hex'),phone='+998'+String(BigInt('0x'+randomBytes(6).toString('hex'))%1000000000n).padStart(9,'0');
 const c=await auth.requestCode(phone,'ru',key()),a=await auth.verifyCode(c.challengeId,messages.at(-1)!.code,key()),profile=randomUUID();
 await query("INSERT INTO guest_profiles(id,organization_id,user_id,first_name,last_name) VALUES($1,$2,$3,'Synthetic','Offer')",[profile,org,a.userId]);return {...a,profile};
}
async function quote(expired=false){
 const id=randomUUID();const inserted=await query(`INSERT INTO booking_quotes(id,organization_id,property_id,unit_id,rate_plan_id,check_in_at,check_out_at,guest_context,currency,accommodation_minor,total_minor,cancellation_policy_snapshot,pricing_snapshot,input_hash,expires_at)
 SELECT $1,$2,$3,u.id,r.id,'2037-09-01','2037-09-03','{}','UZS',9007199254740993,9007199254740993,'{}','{"private":"secret"}','synthetic',now()+make_interval(secs=>$4)
 FROM units u JOIN rate_plans r ON r.property_id=u.property_id AND r.unit_type_id=u.unit_type_id WHERE u.property_id=$3 LIMIT 1`,[id,org,property,expired?-60:600]);expect(inserted.rowCount).toBe(1);await query("INSERT INTO booking_quote_lines(quote_id,line_type,code,label,amount_minor,currency,metadata) VALUES($1,'accommodation','ROOM','{}',9007199254740993,'UZS','{\"internal\":\"secret\"}')",[id]);return id;
}
beforeAll(async()=>{expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST');const type=randomUUID();
 await query("INSERT INTO unit_types(id,property_id,name,max_guests) VALUES($1,$2,'{}',2)",[type,property]);
 await query("INSERT INTO units(property_id,unit_type_id,code) VALUES($1,$2,$3)",[property,type,'offer-'+type]);
 await query("INSERT INTO rate_plans(property_id,unit_type_id,name,currency,base_nightly_minor) VALUES($1,$2,'{}','UZS',100)",[property,type]);
 staffToken=randomBytes(32).toString('hex');expect((await db.query('SELECT app.staff_auth_start($1,1,$2) ok',[member,hash(staffToken)])).rows[0].ok).toBe(true);});
beforeEach(()=>{for(const [k,v] of Object.entries({NODE_ENV:'test',VIEWS_LOCAL_REHEARSAL:'true',VIEWS_GUEST_QUOTES_PILOT_ENABLED:'true',VIEWS_GUEST_SMS_PILOT_ENABLED:'true',VIEWS_GUEST_SMS_OTP_KEY:'ab'.repeat(32),VIEWS_STAFF_AUTH_PILOT_ENABLED:'true',VIEWS_STAFF_AUTH_ORGANIZATION_ID:org}))vi.stubEnv(k,v);});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
it('issues once concurrently, projects exact money and excludes internal data',async()=>{
 const a=await account(),id=await quote();await Promise.all([offers.issue(staffToken,id,a.profile),offers.issue(staffToken,id,a.profile)]);
 const result=await offers.read(a.token,id);expect(result).toMatchObject({quoteId:id,totalMinor:'9007199254740993',currency:'UZS',lines:[{code:'ROOM',amountMinor:'9007199254740993'}]});expect(JSON.stringify(result)).not.toMatch(/private|secret|guestContext|userId|profileId/);
 expect((await query("SELECT count(*)::int n FROM audit_log WHERE entity_id=$1 AND action='guest_quote.issued'",[id])).rows[0].n).toBe(1);
});
it('rejects another guest, unassigned quotes, reassignment and direct table access',async()=>{
 const a=await account(),b=await account(),id=await quote();await offers.issue(staffToken,id,a.profile);
 await expect(offers.read(b.token,id)).rejects.toThrow('GUEST_QUOTE_NOT_FOUND');await expect(offers.read(a.token,await quote())).rejects.toThrow('GUEST_QUOTE_NOT_FOUND');
 await expect(offers.issue(staffToken,id,b.profile)).rejects.toThrow('GUEST_QUOTE_CONFLICT');
 await expect(db.query('SELECT * FROM guest_identity_private.quote_offers')).rejects.toMatchObject({code:'42501'});
});
it('rejects expired quotes, unlinked owners and revoked SMS sessions',async()=>{
 const a=await account();await expect(offers.issue(staffToken,await quote(true),a.profile)).rejects.toThrow('GUEST_QUOTE_NOT_FOUND');
 const id=await quote();await offers.issue(staffToken,id,a.profile);await query('UPDATE guest_profiles SET user_id=NULL WHERE id=$1',[a.profile]);await expect(offers.read(a.token,id)).rejects.toThrow('GUEST_QUOTE_NOT_FOUND');
 await auth.logout(a.token);await expect(offers.read(a.token,id)).rejects.toThrow('GUEST_SESSION_INVALID');
 await expect(db.query('SELECT app.read_guest_quote($1,$2)',[hash(a.token),id])).rejects.toMatchObject({code:'28000'});
});
it('requires real staff scope, validates identifiers and defaults off',async()=>{
 const a=await account(),id=await quote();await expect(offers.issue(a.token,id,a.profile)).rejects.toThrow('STAFF_SESSION_REQUIRED');
 await expect(offers.issue(staffToken,randomUUID(),a.profile)).rejects.toThrow('GUEST_QUOTE_STAFF_DENIED');
 await expect(offers.read(a.token,'bad')).rejects.toThrow('GUEST_QUOTE_INPUT_INVALID');
 vi.stubEnv('VIEWS_GUEST_QUOTES_PILOT_ENABLED','false');await expect(offers.read(a.token,id)).rejects.toThrow('GUEST_QUOTES_DISABLED');
});

it('denies a revoked staff session even for an already-issued offer',async()=>{
 const token=randomBytes(32).toString('hex');await db.query('SELECT app.staff_auth_start($1,1,$2)',[member,hash(token)]);
 const a=await account(),id=await quote();await offers.issue(token,id,a.profile);
 await db.query('SELECT app.staff_auth_logout($1)',[hash(token)]);
 await expect(offers.issue(token,id,a.profile)).rejects.toThrow();
 await expect(db.query('SELECT app.issue_guest_quote($1,$2,$3)',[hash(token),id,a.profile])).rejects.toMatchObject({code:'42501'});
});
