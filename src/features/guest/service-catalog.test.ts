import {describe,it,expect} from 'vitest';
import {primaryServices,additionalServices,guestRequestCategory} from './service-catalog';
describe('presentation request-code compatibility, not server activation',()=>{
 it('retains all eight historical request mappings including disconnected live minimart',()=>{
  const codes=['cleaning','laundry','minimart','concierge','rent_car','restaurant','bar','spa'];
  expect(codes.map(id=>guestRequestCategory(id))).toEqual(codes);
  expect(primaryServices).toHaveLength(8);expect(additionalServices).toHaveLength(3);
 });
 it('does not invent request adapters for new directions or unknown inputs',()=>{
  for(const id of ['transfer','excursions','tickets','unknown','', '__proto__'])expect(guestRequestCategory(id)).toBeNull();
 });
});
