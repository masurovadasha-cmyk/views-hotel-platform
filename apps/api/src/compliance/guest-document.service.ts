import {randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {assertComplianceRole} from "./compliance-authorization";
import {supportsDocumentUpload} from "./document-upload-vault.port";
import {ComplianceProviderRegistry} from "./provider.registry";

type RegistrationPolicyConfig={documentVaultId:string};
type ResidencyConditions={defaultStorageRegion?:string};

const allowedDocumentTypes=new Set([
  "passport","id_card","birth_certificate","residence_permit","travel_document","other"
]);

@Injectable()
export class GuestDocumentService{
  constructor(
    private readonly db:DatabaseService,
    private readonly providers:ComplianceProviderRegistry
  ){}

  async beginUpload(
    actor:RequestActorContext,
    reservationGuestId:string,
    input:{documentType:string;contentType:string;issuingCountryCode?:string;expiresOn?:string;maxBytes?:number}
  ){
    if(!allowedDocumentTypes.has(input.documentType))throw new Error("INVALID_DOCUMENT_TYPE");
    if(!/^[-\w.]+\/[-+\w.]+$/.test(input.contentType))throw new Error("INVALID_DOCUMENT_CONTENT_TYPE");
    const maxBytes=input.maxBytes??12*1024*1024;
    if(!Number.isInteger(maxBytes)||maxBytes<1024||maxBytes>25*1024*1024)throw new Error("INVALID_DOCUMENT_MAX_BYTES");

    const context=await this.db.withActor(actor,async client=>{
      await assertComplianceRole(client,actor.membershipId,["host","owner","manager","front_desk"]);
      const guest=(await client.query<{
        property_id:string;country_code:string;timezone:string;reservation_status:string;
      }>(
        `SELECT r.property_id,p.country_code,p.timezone,r.status AS reservation_status
           FROM reservation_guests rg
           JOIN reservations r ON r.id=rg.reservation_id
           JOIN properties p ON p.id=r.property_id
          WHERE rg.id=$1`,
        [reservationGuestId]
      )).rows[0];
      if(!guest)throw new Error("RESERVATION_GUEST_NOT_FOUND");
      if(!["confirmed","checked_in"].includes(guest.reservation_status))throw new Error("DOCUMENT_UPLOAD_NOT_AVAILABLE");

      const access=(await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[guest.property_id]
      )).rows[0]?.allowed;
      if(!access)throw new Error("PROPERTY_FORBIDDEN");

      const policyDate=(await client.query<{local_date:string}>(
        "SELECT (now() AT TIME ZONE $1)::date::text AS local_date",[guest.timezone]
      )).rows[0].local_date;

      const registration=(await client.query<{config:RegistrationPolicyConfig}>(
        `SELECT config FROM compliance_policy_versions
          WHERE organization_id=$1 AND country_code=$2 AND code='guest_registration'
            AND active=true AND effective_from<=$3::date
            AND (effective_to IS NULL OR effective_to>=$3::date)
          ORDER BY version DESC LIMIT 1`,
        [actor.organizationId,guest.country_code,policyDate]
      )).rows[0];
      if(!registration?.config?.documentVaultId)throw new Error("REGISTRATION_POLICY_NOT_CONFIGURED");

      const residency=(await client.query<{
        id:string;required_storage_region:string|null;cross_border_allowed:boolean;conditions:ResidencyConditions;
      }>(
        `SELECT id,required_storage_region,cross_border_allowed,conditions
           FROM data_residency_policies
          WHERE organization_id=$1 AND country_code=$2
            AND data_category='guest_identity_document'
            AND active=true AND effective_from<=$3::date
            AND (effective_to IS NULL OR effective_to>=$3::date)
          ORDER BY effective_from DESC LIMIT 1`,
        [actor.organizationId,guest.country_code,policyDate]
      )).rows[0];
      if(!residency)throw new Error("DATA_RESIDENCY_POLICY_NOT_CONFIGURED");

      const storageRegion=residency.required_storage_region
        ??residency.conditions?.defaultStorageRegion
        ??null;
      if(!storageRegion)throw new Error("DOCUMENT_STORAGE_REGION_UNRESOLVED");

      return {
        vaultId:registration.config.documentVaultId,
        storageRegion,
        residencyPolicyId:residency.id
      };
    });

    const vault=this.providers.vault(context.vaultId);
    if(!supportsDocumentUpload(vault))throw new Error("DOCUMENT_UPLOAD_NOT_SUPPORTED");

    const documentRecordId=randomUUID();
    const upload=await vault.createUpload({
      documentRecordId,organizationId:actor.organizationId,reservationGuestId,
      storageRegion:context.storageRegion,contentType:input.contentType,maxBytes
    });
    if(upload.storageRegion!==context.storageRegion)throw new Error("DOCUMENT_VAULT_REGION_MISMATCH");
    if(!upload.objectKey||!/^https:\/\//i.test(upload.uploadUrl))throw new Error("INVALID_DOCUMENT_UPLOAD_RESPONSE");

    await this.db.withActor(actor,async client=>{
      await client.query(
        `INSERT INTO guest_document_records(
           id,organization_id,reservation_guest_id,document_type,issuing_country_code,expires_on,
           object_key,storage_region,vault_id,encryption_key_ref,verification_status,data_residency_policy_id
         ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending',$11)`,
        [
          documentRecordId,actor.organizationId,reservationGuestId,input.documentType,
          input.issuingCountryCode??null,input.expiresOn??null,upload.objectKey,
          upload.storageRegion,context.vaultId,upload.encryptionKeyRef??null,context.residencyPolicyId
        ]
      );
    });

    return {
      documentRecordId,uploadUrl:upload.uploadUrl,expiresAt:upload.expiresAt,
      requiredHeaders:upload.requiredHeaders??{},storageRegion:upload.storageRegion
    };
  }
}
