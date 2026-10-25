import {ConciergeSupportService} from './concierge-support.service';
import {ConciergeSupportController,ConciergePreferencesController} from './concierge-support.controller';
import {ConciergeService} from './concierge.service';
import {MarketService} from './market.service';
import {LaundryService} from './laundry.service';
import {Module} from '@nestjs/common';
import {GuestIdentityModule} from '../guest-identity/guest-identity.module';
import {StaffAuthModule} from '../staff-auth/staff-auth.module';
import {ServiceOrderService} from './service-order.service';
import {OperationsQueueService} from './operations-queue.service';
import {OperationsQueueController} from './operations-queue.controller';
import {GuestServiceOrderController,StaffServiceOrderController} from './service-order.controller';
@Module({imports:[GuestIdentityModule,StaffAuthModule],controllers:[OperationsQueueController,ConciergeSupportController,ConciergePreferencesController,GuestServiceOrderController,StaffServiceOrderController],providers:[OperationsQueueService,ConciergeSupportService,ServiceOrderService,LaundryService,MarketService,ConciergeService]})
export class ServiceOrderModule{}
