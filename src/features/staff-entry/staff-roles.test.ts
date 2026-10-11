import {describe,it,expect} from 'vitest';
import {staffRoles,roleInfo,parseStaffRole,requestedStaffRole,staffEntryUrl,staffRoleMatches,staffSections} from './staff-roles';
import catalog from './staff-role-translations.json';
describe('staff role entry boundaries',()=>{
 it('treats entry routes only as valid navigation preferences',()=>{
  for(const role of staffRoles){expect(requestedStaffRole('?staffRole='+role)).toBe(role);const url=new URL(staffEntryUrl(role,false,'/views-hotel-platform/'),'https://example.invalid');expect(url.pathname).toBe('/views-hotel-platform/');expect(url.searchParams.get('api')).toBe('demo');expect(url.searchParams.get('staffRole')).toBe(role);}
  for(const invalid of ['super_admin','admin','front_desk%00','',null,{},'owner&role=admin'])expect(parseStaffRole(invalid)).toBeNull();
  expect(staffEntryUrl('housekeeper',true,'/')).toContain('api=local-core');
 });
 it('rejects a different authenticated role without aliasing privileges',()=>{
  expect(staffRoleMatches('owner','manager')).toBe(false);expect(staffRoleMatches('front_desk','owner')).toBe(false);expect(staffRoleMatches('housekeeper','housekeeper')).toBe(true);expect(staffRoleMatches(null,'front_desk')).toBe(true);
 });
 it('requires both assigned role and server permission for each section',()=>{
  const all=['reservation.manage','reservation.read','housekeeping.work','property.manage','finance.read'];
  expect(staffSections('housekeeper',all)).toEqual(['housekeeping']);expect(staffSections('front_desk',all)).toEqual(['reception','booking','folios']);expect(staffSections('accountant',all)).toEqual(['folios','refunds']);
  expect(staffSections('owner',['reservation.read'])).toEqual(['folios']);expect(staffSections('owner',[])).toEqual([]);expect(staffSections('technician',all)).toEqual([]);expect(staffSections('concierge',all)).toEqual([]);expect(staffSections('super_admin',all)).toEqual([]);
  expect(staffSections('procurement',['purchase.manage'])).toEqual([]);expect(staffSections('warehouse',['stock.manage'])).toEqual([]);expect(staffSections('procurement',['supply.read'])).toEqual(['supplies']);expect(staffSections('warehouse',['supply.read'])).toEqual(['supplies']);expect(staffSections('housekeeper',['supply.read'])).toEqual([]);
 });
 it('provides Russian and Uzbek labels for each distinct role and its work areas',()=>{
  const messages=catalog as Record<string,{ru:string;uz:string}>;
  for(const role of staffRoles){const info=roleInfo[role];for(const text of [info.title,info.description,...info.tasks]){expect(messages[text]?.ru).toBeTruthy();expect(messages[text]?.uz).toBeTruthy();}}
 });
});
