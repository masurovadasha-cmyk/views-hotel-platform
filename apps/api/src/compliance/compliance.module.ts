import {Module} from "@nestjs/common";
import {ComplianceController} from "./compliance.controller";
import {FiscalizationService} from "./fiscalization.service";
import {GuestAccessController} from "./guest-access.controller";
import {GuestAccessService} from "./guest-access.service";
import {GuestAuthController} from "./guest-auth.controller";
import {GuestAuthProviderRegistry} from "./guest-auth-provider.registry";
import {GuestAuthService} from "./guest-auth.service";
import {GuestDocumentService} from "./guest-document.service";
import {GuestRegistrationService} from "./guest-registration.service";
import {GuestSelfController} from "./guest-self.controller";
import {GuestSelfService} from "./guest-self.service";
import {RegistrationDeadlineService} from "./registration-deadline.service";
import {ComplianceProviderRegistry} from "./provider.registry";

@Module({
  controllers:[ComplianceController,GuestAccessController,GuestAuthController,GuestSelfController],
  providers:[
    ComplianceProviderRegistry,GuestAuthProviderRegistry,GuestAccessService,GuestAuthService,
    GuestSelfService,GuestDocumentService,GuestRegistrationService,
    RegistrationDeadlineService,FiscalizationService
  ],
  exports:[
    ComplianceProviderRegistry,GuestAuthProviderRegistry,GuestAccessService,GuestAuthService,
    GuestSelfService,GuestDocumentService,GuestRegistrationService,
    RegistrationDeadlineService,FiscalizationService
  ]
})
export class ComplianceModule{}
