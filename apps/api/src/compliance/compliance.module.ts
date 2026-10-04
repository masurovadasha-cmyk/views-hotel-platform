import {Module} from "@nestjs/common";
import {ComplianceController} from "./compliance.controller";
import {FiscalizationService} from "./fiscalization.service";
import {GuestRegistrationService} from "./guest-registration.service";
import {ComplianceProviderRegistry} from "./provider.registry";

@Module({
  controllers:[ComplianceController],
  providers:[ComplianceProviderRegistry,GuestRegistrationService,FiscalizationService],
  exports:[ComplianceProviderRegistry,GuestRegistrationService,FiscalizationService]
})
export class ComplianceModule{}
