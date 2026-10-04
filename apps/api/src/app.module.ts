import {Module} from "@nestjs/common";
import {BookingModule} from "./booking/booking.module";
import {DatabaseModule} from "./database/database.module";
import {HealthController} from "./health.controller";
import {InventoryModule} from "./inventory/inventory.module";
import {RatesModule} from "./rates/rates.module";
import {PaymentsModule} from "./payments/payments.module";
import {ComplianceModule} from "./compliance/compliance.module";
@Module({imports:[DatabaseModule,InventoryModule,RatesModule,BookingModule,PaymentsModule,ComplianceModule],controllers:[HealthController]})
export class AppModule{}