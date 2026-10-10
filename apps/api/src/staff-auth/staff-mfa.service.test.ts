import {afterEach,describe,expect,it,vi} from 'vitest';
import {redactTelemetryValue} from '../security/redacting-logger';
import {StaffMfaService,recoveryCodeDigest} from './staff-mfa.service';
import {StaffAuthService} from './staff-auth.service';
const org='74260000-0000-4000-8000-000000000001';
afterEach(()=>vi.unstubAllEnvs());
describe('local passkey activation boundary',()=>{
 it('stays unavailable by default even inside the staff pilot',()=>{
  vi.stubEnv('VIEWS_STAFF_PASSKEY_PILOT_ENABLED','');
  expect(()=>new StaffMfaService({} as never,{scope:()=>org} as never).scope()).toThrow('STAFF_PASSKEY_NOT_ACTIVATED');
 });
 it('does not allow a passkey flag to bypass the production staff boundary',()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_STAFF_AUTH_PILOT_ENABLED','true');vi.stubEnv('VIEWS_STAFF_PASSKEY_PILOT_ENABLED','true');
  expect(()=>new StaffMfaService({} as never,new StaffAuthService({} as never)).scope()).toThrow('STAFF_AUTH_NOT_ACTIVATED');
 });
 it('requires enrollment password before issuing any challenge',async()=>{
  vi.stubEnv('VIEWS_STAFF_PASSKEY_PILOT_ENABLED','true');const query=vi.fn();
  const service=new StaffMfaService({query} as never,{scope:()=>org,reauthenticate:async()=>{throw Error('STAFF_LOGIN_FAILED');}} as never);
  await expect(service.begin('a'.repeat(64),'register','wrong')).rejects.toThrow('STAFF_LOGIN_FAILED');expect(query).not.toHaveBeenCalled();
 });
 it('does not forward malformed responses or challenge identifiers to PostgreSQL',async()=>{
  vi.stubEnv('VIEWS_STAFF_PASSKEY_PILOT_ENABLED','true');const query=vi.fn();
  const service=new StaffMfaService({query} as never,{scope:()=>org} as never);
  await expect(service.finish('a'.repeat(64),'authenticate','not-a-uuid',{})).rejects.toThrow('STAFF_PASSKEY_INVALID');
  await expect(service.finish('a'.repeat(64),'authenticate',org,{data:'a'.repeat(16001)})).rejects.toThrow('STAFF_PASSKEY_INVALID');expect(query).not.toHaveBeenCalled();
 });
});

describe('recovery code boundary',()=>{
 it('normalizes display separators while binding member and organization',()=>{
  const code='0123456789abcdef0123456789abcdef';
  expect(recoveryCodeDigest(org,'member',code)).toBe(recoveryCodeDigest(org,'member','0123-4567-89AB-CDEF-0123-4567-89AB-CDEF'));
  expect(recoveryCodeDigest(org,'member',code)).not.toBe(recoveryCodeDigest(org,'other',code));
  expect(recoveryCodeDigest(org,'member',code)).not.toBe(recoveryCodeDigest('other','member',code));
  for(const invalid of [null,'',code+'a','g'.repeat(32),'x'.repeat(65)])expect(()=>recoveryCodeDigest(org,'member',invalid)).toThrow('STAFF_PASSKEY_INVALID');
 });
 it('redacts both single codes and one-time returned bundles',()=>{
  expect(redactTelemetryValue({recoveryCode:'secret',recoveryCodes:['secret'],recoveryHash:'digest'})).toEqual({recoveryCode:'[REDACTED]',recoveryCodes:'[REDACTED]',recoveryHash:'[REDACTED]'});
 });
 it('does not issue codes or replacement challenges without password reauthentication',async()=>{
  vi.stubEnv('VIEWS_STAFF_PASSKEY_PILOT_ENABLED','true');const query=vi.fn();
  const service=new StaffMfaService({query} as never,{scope:()=>org,reauthenticate:async()=>{throw Error('STAFF_LOGIN_FAILED');}} as never);
  await expect(service.recoveryCodes('a'.repeat(64),'wrong')).rejects.toThrow('STAFF_LOGIN_FAILED');
  await expect(service.begin('a'.repeat(64),'replace','wrong','0'.repeat(32))).rejects.toThrow('STAFF_LOGIN_FAILED');expect(query).not.toHaveBeenCalled();
 });
});
