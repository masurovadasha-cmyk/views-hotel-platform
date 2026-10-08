import {Module} from '@nestjs/common';
import {GuestIdentityController} from './guest-identity.controller';
import {GuestIdentityService} from './guest-identity.service';
import {GuestSmsRegistry} from './guest-sms.registry';
import {SecurityRateLimitService} from '../security/rate-limit.service';
@Module({controllers:[GuestIdentityController],providers:[GuestIdentityService,GuestSmsRegistry,SecurityRateLimitService],exports:[GuestIdentityService,GuestSmsRegistry]})
export class GuestIdentityModule{}
