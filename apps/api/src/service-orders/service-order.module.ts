import {Module} from '@nestjs/common';
import {GuestIdentityModule} from '../guest-identity/guest-identity.module';
import {StaffAuthModule} from '../staff-auth/staff-auth.module';
import {ServiceOrderService} from './service-order.service';
import {GuestServiceOrderController,StaffServiceOrderController} from './service-order.controller';
@Module({imports:[GuestIdentityModule,StaffAuthModule],controllers:[GuestServiceOrderController,StaffServiceOrderController],providers:[ServiceOrderService]})
export class ServiceOrderModule{}
