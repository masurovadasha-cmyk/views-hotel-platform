import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {GuestEmailService,normalizeGuestEmail} from './guest-email.service';
import {GuestEmailRegistry,type GuestEmailMessage} from './guest-email.registry';
const db=new DatabaseService(),network=()=>randomBytes(32).toString('hex');
const address=()=>`guest-${randomUUID()}@views.invalid`;
function setup(fail=false){
 const messages:GuestEmailMessage[]=[],registry=new GuestEmailRegistry();
 registry.register({send:async m=>{messages.push(m);if(fail)throw Error('SYNTHETIC_PRIVATE_TRANSPORT_ERROR');return {accepted:true};}});
 return {messages,registry,auth:new GuestEmailService(db,registry,new SecurityRateLimitService(db))};
}
beforeAll(async()=>expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST'));
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_GUEST_EMAIL_PILOT_ENABLED','true');vi.stubEnv('VIEWS_GUEST_EMAIL_TOKEN_KEY','cd'.repeat(32));});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('guest email identity / synthetic capture, no external mail',()=>{
 it('authenticates a verified email, persists the session and revokes it without staff rights',async()=>{
  const {auth,messages}=setup(),email=address(),issued=await auth.requestLink(' '+email.toUpperCase()+' ','uz',network());
  expect(Object.keys(issued).sort()).toEqual(['challengeId','expiresInSeconds','resendAfterSeconds','status']);
  expect(messages[0]).toMatchObject({email,challengeId:issued.challengeId,expiresInSeconds:900,locale:'uz'});
  const session=await auth.exchange(issued.challengeId,messages[0].token,network());
  expect(await auth.session(session.token)).toMatchObject({userId:session.userId,email,locale:'uz',role:'guest'});
  const actor={organizationId:'00000000-0000-0000-0000-000000000001',userId:session.userId,membershipId:'30000000-0000-4000-8000-000000000001',requestId:'guest-email-proof'};
  await db.withActor(actor,async c=>expect((await c.query("SELECT app.registry_access(app.current_organization_id(),'00000000-0000-0000-0000-000000000002','reservation.manage') ok")).rows[0].ok).toBe(false));
  expect((await db.query('SELECT * FROM app.staff_auth_resolve($1)',[createHash('sha256').update(session.token).digest('hex')])).rows).toHaveLength(0);
  expect((await db.query('SELECT * FROM app.resolve_guest_identity($1)',[createHash('sha256').update(session.token).digest('hex')])).rows).toHaveLength(0);
  await auth.logout(session.token);await expect(auth.session(session.token)).rejects.toThrow('GUEST_EMAIL_SESSION_INVALID');
  await expect(auth.exchange(issued.challengeId,messages[0].token,network())).rejects.toThrow('GUEST_EMAIL_LINK_INVALID');
 });
 it('allows exactly one winner when five callers exchange the same link',async()=>{
  const {auth,messages}=setup(),issued=await auth.requestLink(address(),'ru',network());
  const results=await Promise.allSettled(Array.from({length:5},()=>auth.exchange(issued.challengeId,messages[0].token,network())));
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
  expect(results.filter(r=>r.status==='rejected')).toHaveLength(4);
 });
 it('serializes requests by normalized address and sends only once',async()=>{
  const {auth,messages}=setup(),email=address();
  const results=await Promise.allSettled([auth.requestLink(email,'ru',network()),auth.requestLink(email.toUpperCase(),'en',network())]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(messages).toHaveLength(1);
  expect((results.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.message).toBe('EMAIL_RESEND_COOLDOWN');
 });
 it('binds the token to its challenge and commits failed guesses',async()=>{
  const {auth,messages}=setup(),a=await auth.requestLink(address(),'ru',network()),b=await auth.requestLink(address(),'ru',network());
  for(let i=0;i<5;i++)await expect(auth.exchange(a.challengeId,messages[1].token,network())).rejects.toThrow('GUEST_EMAIL_LINK_INVALID');
  await expect(auth.exchange(a.challengeId,messages[0].token,network())).rejects.toThrow('GUEST_EMAIL_LINK_INVALID');
  expect((await auth.exchange(b.challengeId,messages[1].token,network())).role).toBe('guest');
 });
 it('never verifies a link whose delivery outcome is uncertain',async()=>{
  const {auth,messages}=setup(true);
  await expect(auth.requestLink(address(),'ru',network())).rejects.toThrow('GUEST_EMAIL_DELIVERY_UNCERTAIN');
  await expect(auth.exchange(messages[0].challengeId,messages[0].token,network())).rejects.toThrow('GUEST_EMAIL_LINK_INVALID');
 });
 it('refuses verification before provider acceptance and after invalidation during delivery',async()=>{
  const registry=new GuestEmailRegistry(),auth=new GuestEmailService(db,registry,new SecurityRateLimitService(db));
  registry.register({send:async m=>{
   await expect(auth.exchange(m.challengeId,m.token,network())).rejects.toThrow('GUEST_EMAIL_LINK_INVALID');
   await db.query('SELECT app.mark_guest_email_delivery($1,false)',[m.challengeId]);return {accepted:true};
  }});
  await expect(auth.requestLink(address(),'ru',network())).rejects.toThrow('GUEST_EMAIL_CHALLENGE_INACTIVE');
 });
 it('fails closed with no provider and keeps private tables inaccessible',async()=>{
  const auth=new GuestEmailService(db,new GuestEmailRegistry(),new SecurityRateLimitService(db));
  await expect(auth.requestLink(address(),'ru',network())).rejects.toThrow('GUEST_EMAIL_NOT_CONNECTED');
  for(const table of ['email_challenges','email_sessions'])await expect(db.query('SELECT * FROM guest_identity_private.'+table)).rejects.toMatchObject({code:'42501'});
 });
 it('requires a separate token key and refuses non-test activation',async()=>{
  const {auth}=setup();vi.stubEnv('VIEWS_GUEST_EMAIL_TOKEN_KEY','');
  await expect(auth.requestLink(address(),'ru',network())).rejects.toThrow('GUEST_EMAIL_KEY_REQUIRED');
  vi.stubEnv('NODE_ENV','production');await expect(auth.requestLink(address(),'ru',network())).rejects.toThrow('GUEST_EMAIL_DISABLED');
 });
 it('invalidates sessions on email change or account suspension',async()=>{
  const {auth,messages}=setup(),a=await auth.requestLink(address(),'en',network()),session=await auth.exchange(a.challengeId,messages[0].token,network());
  await db.query('UPDATE users SET email=$1 WHERE id=$2',[address(),session.userId]);
  await expect(auth.session(session.token)).rejects.toThrow('GUEST_EMAIL_SESSION_INVALID');
  await db.query("UPDATE users SET email=$1,status='suspended' WHERE id=$2",[messages[0].email,session.userId]);
  await expect(auth.session(session.token)).rejects.toThrow('GUEST_EMAIL_SESSION_INVALID');
 });
 it('does not disclose whether the account exists or is suspended in the request response',async()=>{
  const {auth,messages}=setup(),email=address();
  await db.query("INSERT INTO users(email,status) VALUES($1,'suspended')",[email]);
  const issued=await auth.requestLink(email,'ru',network());
  expect(issued.status).toBe('provider_accepted');
  await expect(auth.exchange(issued.challengeId,messages[0].token,network())).rejects.toThrow('GUEST_EMAIL_LINK_INVALID');
 });
 it('enforces a network request limit even for different addresses',async()=>{
  const {auth,messages}=setup(),key=network();
  for(let i=0;i<20;i++)await auth.requestLink(address(),'ru',key);
  await expect(auth.requestLink(address(),'ru',key)).rejects.toThrow('RATE_LIMITED');expect(messages).toHaveLength(20);
 });
 it('rejects malformed mailboxes, but preserves plus addressing and meaningful dots',()=>{
  expect(normalizeGuestEmail(' A.B+tag@Example.COM ')).toBe('a.b+tag@example.com');
  for(const bad of ['a\r\nbcc:x@example.com','a@@example.com','.a@example.com','a..b@example.com','a@-example.com','a@example..com','a@example','а@example.com','x'.repeat(65)+'@example.com'])expect(()=>normalizeGuestEmail(bad)).toThrow('INVALID_GUEST_EMAIL');
 });
});
