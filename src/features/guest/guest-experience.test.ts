import {describe,expect,it} from 'vitest';
import {apartments} from '../../data/demo';
import {filterGuestApartments,guestBookingStep,validGuestServiceDraft} from './guest-experience';
const filter={city:'Tashkent',guests:2,favoritesOnly:false,favorites:[] as string[],amenities:[] as string[]};
describe('Canva guest preview interactions',()=>{
 it('combines destination, capacity, amenities and favorites without inventing listings or rates',()=>{
  const snapshot=JSON.stringify(apartments);
  expect(filterGuestApartments(apartments,{...filter,guests:4,amenities:['Balcony','Workspace']})).toEqual([apartments[1]]);
  expect(filterGuestApartments(apartments,{...filter,favoritesOnly:true,favorites:['garden'],amenities:['Balcony']})).toEqual([apartments[2]]);
  expect(filterGuestApartments(apartments,{...filter,city:'Samarkand'})).toEqual([]);
  expect(filterGuestApartments(apartments,{...filter,guests:5})).toEqual([]);
  expect(JSON.stringify(apartments)).toBe(snapshot);expect(apartments.every(item=>item.nightlyRate===null)).toBe(true);
 });
 it('requires a useful local service description and valid optional preferred date/time',()=>{
  expect(validGuestServiceDraft({details:'  Please arrange cleaning. ',date:'',time:''})).toBe(true);
  expect(validGuestServiceDraft({details:'Please arrange cleaning.',date:'2028-02-29',time:'14:30'})).toBe(true);
  for(const patch of [{details:' '},{details:'x'.repeat(1001)},{date:'2027-02-29'},{date:'2027-13-01'},{time:'24:00'},{time:'12:60'}])expect(validGuestServiceDraft({details:'Synthetic request',date:'',time:'',...patch})).toBe(false);
 });
 it('keeps declined/processing payment in review rather than presenting the confirmation step',()=>{
  expect(guestBookingStep('payment-declined')).toBe(guestBookingStep('payment'));
  expect(guestBookingStep('secure-processing')).toBeLessThan(guestBookingStep('booking-confirmed'));
 });
});
