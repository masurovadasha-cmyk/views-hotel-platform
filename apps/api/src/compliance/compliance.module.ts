import {Module} from "@nestjs/common";
import {ComplianceController} from "./compliance.controller";
import {FiscalizationService} from "./fiscalization.service";
import {GuestAccessController} from "./guest-access.controller";
import {GuestAccessService} from "./guest-access.service";
import {GuestDocumentService} from "./guest-document.service";
import {GuestRegistrationService} from "./guest-registration.service";
import {GuestSelfController} from "./guest-self.controller";
import {GuestSelfService} from "./guest-self.service";
import {RegistrationDeadlineService} from "./registration-deadline.service";
import {ComplianceProviderRegistry} from "./provider.registry";

@Module({
  controllers:[ComplianceController,GuestAccessController,GuestSelfController],
  providers:[
    ComplianceProviderRegistry,GuestAccessService,GuestSelfService,GuestDocumentService,
    GuestRegistrationService,RegistrationDeadlineService,FiscalizationService
  ],
  exports:[
    ComplianceProviderRegistry,GuestAccessService,GuestSelfService,GuestDocumentService,
    GuestRegistrationService,RegistrationDeadlineService,FiscalizationService
  ]
})
export class ComplianceModule{}
