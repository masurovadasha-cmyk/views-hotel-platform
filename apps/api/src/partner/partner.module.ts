import {Module} from '@nestjs/common';
import {PartnerService} from './partner.service';
import {PartnerDispatchController,PartnerAssignmentsController} from './partner.controller';
import {PartnerBoundaryGuard} from './partner-boundary.guard';
@Module({controllers:[PartnerDispatchController,PartnerAssignmentsController],providers:[PartnerService,PartnerBoundaryGuard]})
export class PartnerModule{}
