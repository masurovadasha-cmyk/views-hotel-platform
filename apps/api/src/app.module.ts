import {Module} from "@nestjs/common";
import {DatabaseModule} from "./database/database.module";
import {HealthController} from "./health.controller";
import {InventoryModule} from "./inventory/inventory.module";
@Module({imports:[DatabaseModule,InventoryModule],controllers:[HealthController]})
export class AppModule{}