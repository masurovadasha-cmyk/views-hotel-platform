import {Module} from '@nestjs/common';
import {OwnerInventoryController} from './owner-inventory.controller';
import {OwnerInventoryService} from './owner-inventory.service';
@Module({controllers:[OwnerInventoryController],providers:[OwnerInventoryService]})
export class OwnerModule{}
