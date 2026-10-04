import {Module} from "@nestjs/common";
import {ComplianceController} from "./compliance.controller";
import {FiscalizationService} from "./fiscalization.service";
import {GuestRegistrationService} from "./guest-registration.service";
import {RegistrationDeadlineService} from "./registration-deadline.service";
import {ComplianceProviderRegistry} from "./provider.registry";

@Module({
  controllers:[ComplianceController],
  providers:[ComplianceProviderRegistry,GuestRegistrationService,RegistrationDeadlineService,FiscalizationService],
  exports:[ComplianceProviderRegistry,GuestRegistrationService,RegistrationDeadlineService,FiscalizationService]
})
export class ComplianceModule{}
