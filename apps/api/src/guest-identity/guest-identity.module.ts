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
@Module({controllers:[GuestIdentityController,GuestEmailController,GuestTripsController],providers:[GuestTripsService,GuestIdentityService,GuestSmsRegistry,SecurityRateLimitService,GuestEmailService,GuestEmailRegistry],exports:[GuestIdentityService,GuestSmsRegistry,GuestEmailService,GuestEmailRegistry]})
export class GuestIdentityModule{}
