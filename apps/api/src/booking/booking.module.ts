import {InventorySearchController} from './inventory-search.controller';
import {InventorySearchService} from './inventory-search.service';
import {BookingStayController} from './booking-stay.controller';
import {BookingStayService} from './booking-stay.service';
import {Module} from "@nestjs/common";
import {BookingWorkspaceController} from "./booking-workspace.controller";
import {BookingController} from "./booking.controller";
import {BookingHoldService} from "./booking-hold.service";
import {BookingLifecycleService} from "./booking-lifecycle.service";
@Module({controllers:[InventorySearchController,BookingStayController,BookingController,BookingWorkspaceController],providers:[InventorySearchService,BookingStayService,BookingHoldService,BookingLifecycleService]})
export class BookingModule{}
