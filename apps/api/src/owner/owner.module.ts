import {OwnerRatesService} from './owner-rates.service';
import {OwnerCalendarService} from './owner-calendar.service';
import {Module} from '@nestjs/common';
import {OwnerInventoryController} from './owner-inventory.controller';
import {OwnerInventoryService} from './owner-inventory.service';
@Module({controllers:[OwnerInventoryController],providers:[OwnerInventoryService,OwnerCalendarService,OwnerRatesService]})
export class OwnerModule{}
