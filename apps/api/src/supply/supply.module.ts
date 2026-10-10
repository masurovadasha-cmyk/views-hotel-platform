import {Module} from '@nestjs/common';
import {SupplyController} from './supply.controller';
import {SupplyReadService} from './supply-read.service';
import {SupplyService} from './supply.service';
import {SupplyStocktakeController} from './supply-stocktake.controller';
import {SupplyStocktakeService} from './supply-stocktake.service';
@Module({controllers:[SupplyController,SupplyStocktakeController],providers:[SupplyReadService,SupplyService,SupplyStocktakeService]})
export class SupplyModule{}
