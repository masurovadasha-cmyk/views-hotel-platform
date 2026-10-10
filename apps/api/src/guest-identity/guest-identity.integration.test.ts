import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash,randomBytes} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {GuestIdentityService} from './guest-identity.service';
import {GuestSmsRegistry,type GuestSmsMessage} from './guest-sms.registry';
const db=new DatabaseService();
const network=()=>randomBytes(32).toString('hex');
// Reserved .test-like phone space is not available for E.164. These synthetic
// numbers are used only by the in-memory adapter, never sent to a real operator.
const phone=()=>'+998'+String(BigInt('0x'+randomBytes(6).toString('hex'))%1000000000n).padStart(9,'0');
function setup(fail=false){
 const messages:GuestSmsMessage[]=[],registry=new GuestSmsRegistry();
 registry.register({send:async message=>{messages.push(message);if(fail)throw Error('SYNTHETIC_SMS_TIMEOUT_WITH_PRIVATE_PAYLOAD');}});
 return {messages,auth:new GuestIdentityService(db,registry,new SecurityRateLimitService(db))};
}
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_GUEST_SMS_PILOT_ENABLED','true');vi.stubEnv('VIEWS_GUEST_SMS_OTP_KEY','ab'.repeat(32));});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('separate guest SMS identity (synthetic adapter only)',()=>{
 it('creates a guest account, authenticates, revokes a session and grants no employee membership',async()=>{
  const {auth,messages}=setup(),challenge=await auth.requestCode(phone(),'uz',network());
  expect(Object.keys(challenge).sort()).toEqual(['challengeId','expiresInSeconds','resendAfterSeconds']);
  const result=await auth.verifyCode(challenge.challengeId,messages[0].code,network());
  expect(await auth.session(result.token)).toMatchObject({userId:result.userId,locale:'uz',role:'guest'});
  expect((await db.query("SELECT count(*)::int n FROM app.resolve_guest_identity($1)",[createHash('sha256').update(result.token).digest('hex')])).rows[0].n).toBe(1);
  const scoped={organizationId:'00000000-0000-0000-0000-000000000001',userId:result.userId,membershipId:'30000000-0000-4000-8000-000000000001',requestId:'synthetic'};
  await db.withActor(scoped,async c=>expect((await c.query("SELECT app.registry_access(app.current_organization_id(),'00000000-0000-0000-0000-000000000002','reservation.manage') ok")).rows[0].ok).toBe(false));
  await auth.logout(result.token);await expect(auth.session(result.token)).rejects.toThrow('GUEST_SESSION_INVALID');
  await expect(auth.verifyCode(challenge.challengeId,messages[0].code,network())).rejects.toThrow('GUEST_CODE_INVALID');
 });
 it('commits failed attempts and prevents the correct code after five guesses',async()=>{
  const {auth,messages}=setup(),challenge=await auth.requestCode(phone(),'ru',network()),wrong=messages[0].code==='000000'?'000001':'000000';
  for(let i=0;i<5;i++)await expect(auth.verifyCode(challenge.challengeId,wrong,network())).rejects.toThrow('GUEST_CODE_INVALID');
  await expect(auth.verifyCode(challenge.challengeId,messages[0].code,network())).rejects.toThrow('GUEST_CODE_INVALID');
 });
 it('allows one concurrent exchange and persists one session',async()=>{
  const {auth,messages}=setup(),challenge=await auth.requestCode(phone(),'en',network());
  const race=await Promise.allSettled(Array.from({length:4},()=>auth.verifyCode(challenge.challengeId,messages[0].code,network())));
  expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(race.filter(r=>r.status==='rejected').every(r=>(r as PromiseRejectedResult).reason.message==='GUEST_CODE_INVALID')).toBe(true);
 });
 it('serializes resend cooldown and never returns a code to the caller',async()=>{
  const {auth,messages}=setup(),number=phone();
  const race=await Promise.allSettled([auth.requestCode(number,'ru',network()),auth.requestCode(number,'ru',network())]);
  expect(race.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(messages).toHaveLength(1);
  expect((race.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message).toBe('SMS_RESEND_COOLDOWN');
 });
 it('refuses uncertain delivery even if the adapter captured the code',async()=>{
  const {auth,messages}=setup(true);
  await expect(auth.requestCode(phone(),'ru',network())).rejects.toThrow('GUEST_SMS_DELIVERY_UNCERTAIN');
  await expect(auth.verifyCode(messages[0].idempotencyKey,messages[0].code,network())).rejects.toThrow('GUEST_CODE_INVALID');
 });
 it('rejects direct access to private authentication tables and an absent provider',async()=>{
  await expect(db.query('SELECT * FROM guest_identity_private.sms_challenges')).rejects.toMatchObject({code:'42501'});
  await expect(db.query('SELECT * FROM guest_identity_private.sessions')).rejects.toMatchObject({code:'42501'});
  const disconnected=new GuestIdentityService(db,new GuestSmsRegistry(),new SecurityRateLimitService(db));
  await expect(disconnected.requestCode(phone(),'ru',network())).rejects.toThrow('GUEST_SMS_NOT_CONNECTED');
 });
 it('revokes access when a synthetic account is suspended without changing its phone or roles',async()=>{
  const {auth,messages}=setup(),challenge=await auth.requestCode(phone(),'ru',network()),session=await auth.verifyCode(challenge.challengeId,messages[0].code,network());
  await db.query("UPDATE users SET status='suspended' WHERE id=$1",[session.userId]);
  await expect(auth.session(session.token)).rejects.toThrow('GUEST_SESSION_INVALID');
 });
 it('requires explicit activation and a separate configured OTP key',async()=>{
  const {auth}=setup();vi.stubEnv('VIEWS_GUEST_SMS_OTP_KEY','');await expect(auth.requestCode(phone(),'ru',network())).rejects.toThrow('GUEST_SMS_KEY_REQUIRED');
  vi.stubEnv('VIEWS_GUEST_SMS_PILOT_ENABLED','');await expect(auth.requestCode(phone(),'ru',network())).rejects.toThrow('GUEST_IDENTITY_DISABLED');
 });
});
