import {ConciergeSupportService} from './concierge-support.service';
import {ConciergeSupportController,ConciergePreferencesController} from './concierge-support.controller';
import {ConciergeService} from './concierge.service';
import {MarketService} from './market.service';
import {LaundryService} from './laundry.service';
import {Module} from '@nestjs/common';
import {GuestIdentityModule} from '../guest-identity/guest-identity.module';
import {StaffAuthModule} from '../staff-auth/staff-auth.module';
import {ServiceOrderService} from './service-order.service';
import {GuestServiceOrderController,StaffServiceOrderController} from './service-order.controller';
@Module({imports:[GuestIdentityModule,StaffAuthModule],controllers:[ConciergeSupportController,ConciergePreferencesController,GuestServiceOrderController,StaffServiceOrderController],providers:[ConciergeSupportService,ServiceOrderService,LaundryService,MarketService,ConciergeService]})
export class ServiceOrderModule{}
