import {StaffMfaService} from './staff-mfa.service';
import {Module} from '@nestjs/common';
import {StaffAuthController} from './staff-auth.controller';
import {StaffAuthService} from './staff-auth.service';
@Module({controllers:[StaffAuthController],providers:[StaffAuthService,StaffMfaService],exports:[StaffAuthService]})
export class StaffAuthModule{}
