import {describe,it,expect} from 'vitest';
import {DUMMY_PASSWORD_HASH,hashStaffPassword,normalizePassword,verifyStaffPassword} from './staff-password';

describe('staff password hashing',()=>{
 it('uses a unique salt and verifies only the correct local fixture password',async()=>{
  const password='This is an isolated test phrase 7.25';
  const first=await hashStaffPassword(password),second=await hashStaffPassword(password);
  expect(first).toMatch(/^scrypt-v1\$131072\$8\$1\$/);expect(first).not.toBe(second);expect(first).not.toContain(password);
  expect(await verifyStaffPassword(password,first)).toBe(true);
  expect(await verifyStaffPassword('This is a different test phrase',first)).toBe(false);
 },15000);
 it('does not silently truncate long passwords',()=>{
  expect(()=>normalizePassword('x'.repeat(129))).toThrow('STAFF_PASSWORD_POLICY');
  expect(()=>normalizePassword('short')).toThrow('STAFF_PASSWORD_POLICY');
 });
 it('allows long Unicode phrases without a forced character-class rule',async()=>{
  const password='Это исключительно тестовая длинная фраза';
  expect(await verifyStaffPassword(password,await hashStaffPassword(password))).toBe(true);
 },15000);
 it('rejects empty, control-only and elementary blocked passwords',()=>{
  for(const v of ['',null,'a'.repeat(20),'passwordpassword','a long password\nvalue'])expect(()=>normalizePassword(v)).toThrow();
 });
 it('dummy and malformed hashes never authenticate',async()=>{
  expect(await verifyStaffPassword('isolated fixture password',DUMMY_PASSWORD_HASH)).toBe(false);
  expect(await verifyStaffPassword('isolated fixture password','invalid')).toBe(false);
 },15000);
});
