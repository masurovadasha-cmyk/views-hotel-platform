import {Module} from "@nestjs/common";
import {BookingModule} from "./booking/booking.module";
import {DatabaseModule} from "./database/database.module";
import {HealthController} from "./health.controller";
import {InventoryModule} from "./inventory/inventory.module";
@Module({imports:[DatabaseModule,InventoryModule,BookingModule],controllers:[HealthController]})
export class AppModule{}