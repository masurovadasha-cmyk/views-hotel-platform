import {afterAll,afterEach,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
import {randomBytes,randomUUID} from 'node:crypto';
import {DatabaseService} from '../database/database.service';
import {StaffAuthService,requireStaffPermission} from './staff-auth.service';
const db=new DatabaseService(),auth=new StaffAuthService(db);
const organizationId='10000000-0000-4000-8000-000000000001',propertyId='10000000-0000-4000-8000-000000000002';
const fixtures=[{role:'procurement',digit:'1',permission:'purchase.manage',denied:'stock.manage'},
 {role:'warehouse',digit:'2',permission:'stock.manage',denied:'purchase.manage'}];
beforeAll(async()=>{
 expect((await db.query("SELECT shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') marker")).rows[0].marker).toBe('VIEWS_DISPOSABLE_CORE_TEST');
});
beforeEach(()=>{vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_STAFF_AUTH_PILOT_ENABLED','true');vi.stubEnv('VIEWS_STAFF_AUTH_ORGANIZATION_ID',organizationId);});
afterEach(()=>vi.unstubAllEnvs());afterAll(()=>db.onModuleDestroy());
describe.sequential('supply employee login / disposable PostgreSQL',()=>{
 it.each(fixtures)('$role accepts invitation and signs in with only its own property-scoped permissions',async fixture=>{
  const email=fixture.role+'-auth-proof@views.invalid',password='Synthetic supply '+randomBytes(14).toString('hex');
  await expect(auth.login({email,password},'supply-fixture')).rejects.toThrow('STAFF_LOGIN_FAILED');
  expect(await auth.accept({token:fixture.digit.repeat(64),password},'invite','supply-fixture')).toEqual({ok:true,loginRequired:true});
  await expect(auth.accept({token:fixture.digit.repeat(64),password},'invite','supply-fixture')).rejects.toThrow('STAFF_ACTIVATION_INVALID');
  await expect(auth.login({email,password:password+'wrong'},'supply-fixture')).rejects.toThrow('STAFF_LOGIN_FAILED');
  const session=await auth.login({email,password},'supply-fixture');
  expect(session.identity).toMatchObject({organizationId,role:fixture.role,email,emailVerified:false,propertyIds:[propertyId],permissions:[fixture.permission,'supply.read']});
  expect(()=>requireStaffPermission(session.identity,fixture.permission)).not.toThrow();
  for(const permission of [fixture.denied,'reservation.manage','finance.manage','staff.manage'])expect(()=>requireStaffPermission(session.identity,permission)).toThrow('STAFF_PERMISSION_DENIED');
  expect(await auth.resolve(session.token)).toEqual(session.identity);
  // The pilot requires an RFC UUID; the legacy all-zero organization fixture
  // would disable the pilot before the session organization boundary is checked.
  vi.stubEnv('VIEWS_STAFF_AUTH_ORGANIZATION_ID',randomUUID());
  await expect(auth.resolve(session.token)).rejects.toThrow('STAFF_SESSION_REQUIRED');
  vi.stubEnv('VIEWS_STAFF_AUTH_ORGANIZATION_ID',organizationId);
  expect(await auth.logout(session.token,true)).toEqual({ok:true});
  await expect(auth.resolve(session.token)).rejects.toThrow('STAFF_SESSION_REQUIRED');
 },15000);
 it('retains operator-only invitations and private credentials outside runtime access',async()=>{
  await expect(db.query("SELECT staff_private.issue_token($1,'invite',$2,'local_fixture')",['76500000-0000-4000-8000-000000000011','f'.repeat(64)])).rejects.toMatchObject({code:'42501'});
  await expect(db.query('SELECT password_hash FROM staff_private.credentials')).rejects.toMatchObject({code:'42501'});
 });
 it('stays disabled outside the explicitly local test pilot',async()=>{
  vi.stubEnv('VIEWS_STAFF_AUTH_PILOT_ENABLED','false');await expect(auth.login({email:'procurement-auth-proof@views.invalid',password:'unused'},'supply-fixture')).rejects.toThrow('STAFF_AUTH_NOT_ACTIVATED');
  vi.stubEnv('VIEWS_STAFF_AUTH_PILOT_ENABLED','true');vi.stubEnv('NODE_ENV','production');await expect(auth.resolve('1'.repeat(64))).rejects.toThrow('STAFF_AUTH_NOT_ACTIVATED');
 });
});
