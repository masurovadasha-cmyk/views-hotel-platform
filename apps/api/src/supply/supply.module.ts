import {Module} from '@nestjs/common';
import {SupplyController} from './supply.controller';
import {SupplyReadService} from './supply-read.service';
import {SupplyService} from './supply.service';
@Module({controllers:[SupplyController],providers:[SupplyReadService,SupplyService]})
export class SupplyModule{}
