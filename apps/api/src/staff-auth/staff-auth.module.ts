import {Module} from '@nestjs/common';
import {StaffAuthController} from './staff-auth.controller';
import {StaffAuthService} from './staff-auth.service';
@Module({controllers:[StaffAuthController],providers:[StaffAuthService],exports:[StaffAuthService]})
export class StaffAuthModule{}
