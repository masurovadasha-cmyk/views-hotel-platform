import {Injectable} from "@nestjs/common";
import type {DocumentVaultPort} from "./document-vault.port";
import type {FiscalizationProviderPort} from "./fiscalization-provider.port";
import type {GuestRegistrationProviderPort} from "./guest-registration-provider.port";

@Injectable()
export class ComplianceProviderRegistry{
  private readonly registration=new Map<string,GuestRegistrationProviderPort>();
  private readonly fiscalization=new Map<string,FiscalizationProviderPort>();
  private readonly vaults=new Map<string,DocumentVaultPort>();

  registerGuestRegistration(provider:GuestRegistrationProviderPort){
    if(this.registration.has(provider.provider))throw new Error("REGISTRATION_PROVIDER_ALREADY_REGISTERED");
    this.registration.set(provider.provider,provider);
  }
  registerFiscalization(provider:FiscalizationProviderPort){
    if(this.fiscalization.has(provider.provider))throw new Error("FISCALIZATION_PROVIDER_ALREADY_REGISTERED");
    this.fiscalization.set(provider.provider,provider);
  }
  registerVault(vault:DocumentVaultPort){
    if(this.vaults.has(vault.vaultId))throw new Error("DOCUMENT_VAULT_ALREADY_REGISTERED");
    this.vaults.set(vault.vaultId,vault);
  }

  guestRegistration(provider:string){
    const adapter=this.registration.get(provider);
    if(!adapter)throw new Error("REGISTRATION_PROVIDER_NOT_CONNECTED");
    return adapter;
  }
  fiscalizationProvider(provider:string){
    const adapter=this.fiscalization.get(provider);
    if(!adapter)throw new Error("FISCALIZATION_PROVIDER_NOT_CONNECTED");
    return adapter;
  }
  vault(vaultId:string){
    const adapter=this.vaults.get(vaultId);
    if(!adapter)throw new Error("DOCUMENT_VAULT_NOT_CONNECTED");
    return adapter;
  }

  connected(){
    return {
      guestRegistration:[...this.registration.keys()].sort(),
      fiscalization:[...this.fiscalization.keys()].sort(),
      documentVaults:[...this.vaults.keys()].sort()
    };
  }
}
