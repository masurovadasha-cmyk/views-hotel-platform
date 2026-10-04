import {Module} from "@nestjs/common";
import {ComplianceController} from "./compliance.controller";
import {FiscalizationService} from "./fiscalization.service";
import {GuestDocumentService} from "./guest-document.service";
import {GuestRegistrationService} from "./guest-registration.service";
import {RegistrationDeadlineService} from "./registration-deadline.service";
import {ComplianceProviderRegistry} from "./provider.registry";

@Module({
  controllers:[ComplianceController],
  providers:[ComplianceProviderRegistry,GuestDocumentService,GuestRegistrationService,RegistrationDeadlineService,FiscalizationService],
  exports:[ComplianceProviderRegistry,GuestDocumentService,GuestRegistrationService,RegistrationDeadlineService,FiscalizationService]
})
export class ComplianceModule{}
