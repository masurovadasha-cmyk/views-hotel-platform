import {Module} from "@nestjs/common";
import {BookingController} from "./booking.controller";
import {BookingHoldService} from "./booking-hold.service";
import {BookingLifecycleService} from "./booking-lifecycle.service";
@Module({controllers:[BookingController],providers:[BookingHoldService,BookingLifecycleService]})
export class BookingModule{}
