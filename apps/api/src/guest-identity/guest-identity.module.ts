import {PaymentsModule} from '../payments/payments.module';
import {GuestCancellationService} from './guest-cancellation.service';
import {GuestCancellationController} from './guest-cancellation.controller';
import {StaffAuthModule} from '../staff-auth/staff-auth.module';
import {GuestReservationLinkService} from './guest-reservation-link.service';
import {StaffGuestLinkController,GuestReservationLinkController} from './guest-reservation-link.controller';
import {GuestTripsService} from './guest-trips.service';
import {GuestTripsController} from './guest-trips.controller';
import {Module} from '@nestjs/common';
import {GuestIdentityController} from './guest-identity.controller';
import {GuestIdentityService} from './guest-identity.service';
import {GuestSmsRegistry} from './guest-sms.registry';
import {SecurityRateLimitService} from '../security/rate-limit.service';
import {GuestEmailController} from './guest-email.controller';
import {GuestEmailService} from './guest-email.service';
import {GuestEmailRegistry} from './guest-email.registry';
@Module({imports:[StaffAuthModule,PaymentsModule],controllers:[GuestCancellationController,StaffGuestLinkController,GuestReservationLinkController,GuestIdentityController,GuestEmailController,GuestTripsController],providers:[GuestCancellationService,GuestReservationLinkService,GuestTripsService,GuestIdentityService,GuestSmsRegistry,SecurityRateLimitService,GuestEmailService,GuestEmailRegistry],exports:[GuestIdentityService,GuestSmsRegistry,GuestEmailService,GuestEmailRegistry]})
export class GuestIdentityModule{}
