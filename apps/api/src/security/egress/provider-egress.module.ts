import {Module} from "@nestjs/common";
import {ProviderEgressAuditStore} from "./provider-egress-audit.store";
import {ProviderEgressReconciliationService} from "./provider-egress-reconciliation.service";

@Module({
  providers:[ProviderEgressAuditStore,ProviderEgressReconciliationService],
  exports:[ProviderEgressAuditStore,ProviderEgressReconciliationService]
})
export class ProviderEgressModule{}
