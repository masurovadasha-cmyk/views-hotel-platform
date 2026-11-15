import {expect,it,vi} from 'vitest';
import {GuestDemoPaymentController} from './guest-demo-payment.controller';
import {GuestDemoPaymentService} from './guest-demo-payment.service';
it('accepts only reservationId and never accepts client money/provider/actor fields',()=>{
 const pay=vi.fn(),controller=new GuestDemoPaymentController({pay} as unknown as GuestDemoPaymentService);
 for(const body of [null,[],{}, {reservationId:'id',amountMinor:'1'},{reservationId:'id',provider:'payme'},{reservationId:'id',organizationId:'foreign'}])expect(()=>controller.pay('Bearer token',body)).toThrow('DEMO_PAYMENT_INPUT_INVALID');
 expect(pay).not.toHaveBeenCalled();
 controller.pay('Bearer token',{reservationId:'id'});expect(pay).toHaveBeenCalledWith('token','id');
});
it('requires bearer rather than actor headers',()=>{
 const pay=vi.fn(),controller=new GuestDemoPaymentController({pay} as unknown as GuestDemoPaymentService);
 expect(()=>controller.pay(undefined,{reservationId:'id'})).toThrow('GUEST_SESSION_INVALID');expect(pay).not.toHaveBeenCalled();
});
