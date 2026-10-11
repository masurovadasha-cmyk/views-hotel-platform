import type {DecryptedGuestDocument} from "./guest-registration-provider.port";

export interface DocumentVaultPort{
  readonly vaultId:string;
  readDocument(documentRecordId:string):Promise<DecryptedGuestDocument>;
}
