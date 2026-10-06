import {Module} from "@nestjs/common";
import {BookingWorkspaceController} from "./booking-workspace.controller";
import {BookingController} from "./booking.controller";
import {BookingHoldService} from "./booking-hold.service";
import {BookingLifecycleService} from "./booking-lifecycle.service";
@Module({controllers:[BookingController,BookingWorkspaceController],providers:[BookingHoldService,BookingLifecycleService]})
export class BookingModule{}
