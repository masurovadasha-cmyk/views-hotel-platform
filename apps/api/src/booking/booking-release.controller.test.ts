import {describe,it,expect,vi} from 'vitest';
import {BookingController} from './booking.controller';
import type {BookingLifecycleService} from './booking-lifecycle.service';
import type {BookingHoldService} from './booking-hold.service';
const id='00000000-0000-4000-8000-000000000001';
describe('release recovery HTTP boundary',()=>{
 const setup=()=>{const releaseHold=vi.fn().mockResolvedValue({reservationId:id});return {releaseHold,controller:new BookingController({} as BookingHoldService,{releaseHold} as unknown as BookingLifecycleService)};};
 it('forwards recovery, authoritative property and required local session separately from actor',async()=>{const {controller,releaseHold}=setup();await controller.release(id,id,id,id,'request',id,{recoveryOnly:true,propertyId:id},'local-workspace','a'.repeat(64));expect(releaseHold.mock.calls[0]).toEqual([{organizationId:id,userId:id,membershipId:id,requestId:'request'},id,id,{recoveryOnly:true,propertyId:id,staffSession:'a'.repeat(64)}]);});
 it('does not turn a missing local staff session into a trusted internal call',async()=>{const {controller,releaseHold}=setup();await controller.release(id,id,id,id,'request',id,{},'local-workspace');expect(releaseHold.mock.calls[0][3].staffSession).toBe('');});
 it('rejects invalid flags and target overrides before dispatch',async()=>{const {controller,releaseHold}=setup();for(const body of [{recoveryOnly:false},{recoveryOnly:'true'},{reservationId:id},{force:true},null,[]])await expect(controller.release(id,id,id,id,'request',id,body as any,'local-workspace')).rejects.toThrow('INVALID_RECOVERY_ONLY');expect(releaseHold).not.toHaveBeenCalled();});
});
