import {BookingStayController} from './booking-stay.controller';
import {BookingStayService} from './booking-stay.service';
import {Module} from "@nestjs/common";
import {BookingWorkspaceController} from "./booking-workspace.controller";
import {BookingController} from "./booking.controller";
import {BookingHoldService} from "./booking-hold.service";
import {BookingLifecycleService} from "./booking-lifecycle.service";
@Module({controllers:[BookingStayController,BookingController,BookingWorkspaceController],providers:[BookingStayService,BookingHoldService,BookingLifecycleService]})
export class BookingModule{}
