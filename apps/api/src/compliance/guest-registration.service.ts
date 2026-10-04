import {createHash} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {ComplianceProviderRegistry} from "./provider.registry";
import {assertComplianceRole} from "./compliance-authorization";
import {registrationDueAt} from "./uzbekistan-policy";

type RegistrationPolicyConfig={
  provider:string;
  dueHours:number;
  documentVaultId:string;
};

@Injectable()
export class GuestRegistrationService{
  constructor(
    private readonly db:DatabaseService,
    private readonly providers:ComplianceProviderRegistry
  ){}

  async prepareReservation(actor:RequestActorContext,reservationId:string){
    return this.db.withActor(actor,async client=>{
      await assertComplianceRole(client,actor.membershipId,["host","owner","manager","front_desk"]);

      const reservationResult=await client.query<{
        property_id:string;country_code:string;check_in_at:Date;check_out_at:Date;timezone:string;status:string;
      }>(
        `SELECT r.property_id,p.country_code,r.check_in_at,r.check_out_at,p.timezone,r.status
           FROM reservations r
           JOIN properties p ON p.id=r.property_id
          WHERE r.id=$1`,
        [reservationId]
      );
      const reservation=reservationResult.rows[0];
      if(!reservation)throw new Error("RESERVATION_NOT_FOUND");
      if(!["confirmed","checked_in"].includes(reservation.status))throw new Error("REGISTRATION_NOT_AVAILABLE");

      const access=await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[reservation.property_id]
      );
      if(!access.rows[0]?.allowed)throw new Error("PROPERTY_FORBIDDEN");

      const policyDateResult=await client.query<{local_date:string}>(
        "SELECT ($1::timestamptz AT TIME ZONE $2)::date::text AS local_date",
        [reservation.check_in_at,reservation.timezone]
      );
      const localDate=policyDateResult.rows[0].local_date;
      const policyResult=await client.query<{
        id:string;version:number;config:RegistrationPolicyConfig;legal_references:unknown;
      }>(
        `SELECT id,version,config,legal_references
           FROM compliance_policy_versions
          WHERE organization_id=$1
            AND country_code=$2
            AND code='guest_registration'
            AND active=true
            AND effective_from<=$3::date
            AND (effective_to IS NULL OR effective_to>=$3::date)
          ORDER BY version DESC
          LIMIT 1`,
        [actor.organizationId,reservation.country_code,localDate]
      );
      const policy=policyResult.rows[0];
      if(!policy)throw new Error("REGISTRATION_POLICY_NOT_CONFIGURED");
      const config=policy.config;
      if(!config?.provider||!config.documentVaultId)throw new Error("INVALID_REGISTRATION_POLICY");
      const dueAt=registrationDueAt(reservation.check_in_at.toISOString(),Number(config.dueHours));

      const guests=await client.query<{id:string;has_verified_document:boolean}>(
        `SELECT rg.id,
                EXISTS(
                  SELECT 1 FROM guest_document_records d
                  WHERE d.reservation_guest_id=rg.id
                    AND d.verification_status='verified'
                ) AS has_verified_document
           FROM reservation_guests rg
          WHERE rg.reservation_id=$1
          ORDER BY rg.is_primary DESC,rg.created_at`,
        [reservationId]
      );
      if(!guests.rowCount)throw new Error("RESERVATION_GUESTS_REQUIRED");

      const prepared=[];
      for(const guest of guests.rows){
        const status=guest.has_verified_document?"ready":"draft";
        const snapshot={
          policyId:policy.id,version:policy.version,config,legalReferences:policy.legal_references
        };
        const inserted=await client.query<{id:string;status:string;due_at:Date}>(
          `INSERT INTO guest_registration_cases(
             id,organization_id,property_id,reservation_id,reservation_guest_id,country_code,provider,status,due_at,policy_snapshot
           )
           VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
           ON CONFLICT(reservation_guest_id,provider) DO NOTHING
           RETURNING id,status,due_at`,
          [
            actor.organizationId,reservation.property_id,reservationId,guest.id,
            reservation.country_code,config.provider,status,dueAt,JSON.stringify(snapshot)
          ]
        );

        let row=inserted.rows[0];
        if(!row){
          const existing=await client.query<{id:string;status:string;due_at:Date}>(
            "SELECT id,status,due_at FROM guest_registration_cases WHERE reservation_guest_id=$1 AND provider=$2",
            [guest.id,config.provider]
          );
          row=existing.rows[0];
        }else{
          await client.query(
            `INSERT INTO outbox_events(
               id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
             )
             VALUES(gen_random_uuid(),$1,'guest_registration',$2,'compliance.registration_case_prepared',$3,$4::jsonb)
             ON CONFLICT(idempotency_key) DO NOTHING`,
            [
              actor.organizationId,row.id,"compliance:registration-case:"+row.id,
              JSON.stringify({registrationCaseId:row.id,reservationId,provider:config.provider,status})
            ]
          );
        }

        prepared.push({
          id:row.id,status:row.status,dueAt:row.due_at.toISOString(),
          reservationGuestId:guest.id,provider:config.provider
        });
      }
      return {reservationId,cases:prepared};
    });
  }

  async listQueue(actor:RequestActorContext,propertyId:string,status?:string){
    return this.db.withActor(actor,async client=>{
      await assertComplianceRole(client,actor.membershipId,["host","owner","manager","front_desk"]);
      const access=await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[propertyId]
      );
      if(!access.rows[0]?.allowed)throw new Error("PROPERTY_FORBIDDEN");

      const rows=await client.query<{
        id:string;reservation_id:string;reservation_guest_id:string;status:string;provider:string;
        due_at:Date;submitted_at:Date|null;confirmed_at:Date|null;attempt_count:number;last_error_code:string|null;
      }>(
        `SELECT id,reservation_id,reservation_guest_id,status,provider,due_at,submitted_at,confirmed_at,attempt_count,last_error_code
           FROM guest_registration_cases
          WHERE property_id=$1
            AND ($2::text IS NULL OR status::text=$2)
          ORDER BY
            CASE WHEN status='confirmed' THEN 1 ELSE 0 END,
            due_at,
            created_at`,
        [propertyId,status??null]
      );
      return rows.rows.map(x=>({
        id:x.id,reservationId:x.reservation_id,reservationGuestId:x.reservation_guest_id,
        status:x.status,provider:x.provider,dueAt:x.due_at.toISOString(),
        submittedAt:x.submitted_at?.toISOString()??null,confirmedAt:x.confirmed_at?.toISOString()??null,
        attemptCount:x.attempt_count,lastErrorCode:x.last_error_code
      }));
    });
  }

  async submitNow(actor:RequestActorContext,caseId:string){
    const claimed=await this.db.withActor(actor,async client=>{
      await assertComplianceRole(client,actor.membershipId,["host","owner","manager","front_desk"]);

      const rowResult=await client.query<{
        id:string;property_id:string;reservation_id:string;reservation_guest_id:string;provider:string;status:string;
        policy_snapshot:{config:RegistrationPolicyConfig};attempt_count:number;
        check_in_at:Date;check_out_at:Date;first_name:string;last_name:string;date_of_birth:string;
        nationality_country_code:string;residency_country_code:string|null;
      }>(
        `SELECT c.id,c.property_id,c.reservation_id,c.reservation_guest_id,c.provider,c.status,c.policy_snapshot,c.attempt_count,
                r.check_in_at,r.check_out_at,
                g.first_name,g.last_name,g.date_of_birth::text,g.nationality_country_code,g.residency_country_code
           FROM guest_registration_cases c
           JOIN reservations r ON r.id=c.reservation_id
           JOIN reservation_guests g ON g.id=c.reservation_guest_id
          WHERE c.id=$1
          FOR UPDATE`,
        [caseId]
      );
      const row=rowResult.rows[0];
      if(!row)throw new Error("REGISTRATION_CASE_NOT_FOUND");

      const access=await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[row.property_id]
      );
      if(!access.rows[0]?.allowed)throw new Error("PROPERTY_FORBIDDEN");
      if(row.status==="confirmed"){
        return {alreadyConfirmed:true,caseId:row.id} as const;
      }
      if(!["ready","rejected","manual_review"].includes(row.status)){
        throw new Error("REGISTRATION_CASE_NOT_READY");
      }

      const documentResult=await client.query<{
        id:string;storage_region:string;verification_status:string;
      }>(
        `SELECT id,storage_region,verification_status
           FROM guest_document_records
          WHERE reservation_guest_id=$1
            AND verification_status='verified'
          ORDER BY verified_at DESC NULLS LAST,created_at DESC
          LIMIT 1`,
        [row.reservation_guest_id]
      );
      const document=documentResult.rows[0];
      if(!document)throw new Error("VERIFIED_DOCUMENT_REQUIRED");

      const policyConfig=row.policy_snapshot?.config;
      if(!policyConfig?.documentVaultId)throw new Error("INVALID_REGISTRATION_POLICY");

      const residencyPolicy=await client.query<{required_storage_region:string|null;cross_border_allowed:boolean}>(
        `SELECT required_storage_region,cross_border_allowed
           FROM data_residency_policies
          WHERE organization_id=$1
            AND country_code='UZ'
            AND data_category='guest_identity_document'
            AND active=true
            AND effective_from<=current_date
            AND (effective_to IS NULL OR effective_to>=current_date)
          ORDER BY effective_from DESC
          LIMIT 1`,
        [actor.organizationId]
      );
      const storage=residencyPolicy.rows[0];
      if(storage?.required_storage_region&&document.storage_region!==storage.required_storage_region){
        throw new Error("DOCUMENT_STORAGE_REGION_VIOLATION");
      }

      const leaseUntil=new Date(Date.now()+120000);
      const claimedUpdate=await client.query(
        `UPDATE guest_registration_cases
            SET status='submitted',attempt_count=attempt_count+1,lease_until=$2,locked_by=$3,
                last_error_code=NULL,last_error_message=NULL,updated_at=now(),version=version+1
          WHERE id=$1
            AND (lease_until IS NULL OR lease_until<now())
          RETURNING id`,
        [row.id,leaseUntil,actor.requestId]
      );
      if(!claimedUpdate.rowCount)throw new Error("REGISTRATION_CASE_BUSY");

      return {
        alreadyConfirmed:false as const,
        caseId:row.id,propertyId:row.property_id,reservationId:row.reservation_id,
        provider:row.provider,vaultId:policyConfig.documentVaultId,documentRecordId:document.id,
        attempt:row.attempt_count+1,
        checkInAt:row.check_in_at.toISOString(),checkOutAt:row.check_out_at.toISOString(),
        guest:{
          firstName:row.first_name,lastName:row.last_name,dateOfBirth:row.date_of_birth,
          nationalityCountryCode:row.nationality_country_code,residencyCountryCode:row.residency_country_code
        }
      };
    });

    if(claimed.alreadyConfirmed)return {caseId:claimed.caseId,status:"confirmed",idempotentReplay:true};

    const vault=this.providers.vault(claimed.vaultId);
    const provider=this.providers.guestRegistration(claimed.provider);

    try{
      const document=await vault.readDocument(claimed.documentRecordId);
      const submission={
        caseId:claimed.caseId,reservationId:claimed.reservationId,propertyId:claimed.propertyId,
        checkInAt:claimed.checkInAt,checkOutAt:claimed.checkOutAt,guest:claimed.guest,document
      };
      const requestDigest=createHash("sha256").update(JSON.stringify(submission)).digest("hex");
      const result=await provider.submit(submission);

      return await this.db.withActor(actor,async client=>{
        const status=result.status;
        await client.query(
          `UPDATE guest_registration_cases
              SET status=$2,submitted_at=COALESCE(submitted_at,now()),
                  confirmed_at=CASE WHEN $2='confirmed' THEN now() ELSE confirmed_at END,
                  external_registration_id=$3,confirmation_object_key=$4,
                  lease_until=NULL,locked_by=NULL,last_error_code=NULL,last_error_message=NULL,
                  updated_at=now(),version=version+1
            WHERE id=$1 AND locked_by=$5`,
          [
            claimed.caseId,status,result.externalRegistrationId,result.confirmationObjectKey??null,actor.requestId
          ]
        );
        await client.query(
          `INSERT INTO guest_registration_attempts(
             id,registration_case_id,request_digest,response_metadata,attempt_status
           ) VALUES(gen_random_uuid(),$1,$2,$3::jsonb,$4)`,
          [claimed.caseId,requestDigest,JSON.stringify(result.responseMetadata??{}),status]
        );
        await client.query(
          `INSERT INTO outbox_events(
             id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload
           ) VALUES(gen_random_uuid(),$1,'guest_registration',$2,$3,$4,$5::jsonb)
           ON CONFLICT(idempotency_key) DO NOTHING`,
          [
            actor.organizationId,claimed.caseId,
            status==="confirmed"?"compliance.registration_confirmed":"compliance.registration_submitted",
            "compliance:registration:"+claimed.caseId+":"+result.externalRegistrationId+":"+status,
            JSON.stringify({registrationCaseId:claimed.caseId,externalRegistrationId:result.externalRegistrationId})
          ]
        );
        return {
          caseId:claimed.caseId,status,
          externalRegistrationId:result.externalRegistrationId,idempotentReplay:false
        };
      });
    }catch(error){
      const message=error instanceof Error?error.message:"REGISTRATION_PROVIDER_ERROR";
      await this.db.withActor(actor,async client=>{
        const nextAttemptSeconds=Math.min(3600,30*Math.pow(2,Math.min(claimed.attempt,6)));
        const nextStatus=claimed.attempt>=5?"manual_review":"ready";
        await client.query(
          `UPDATE guest_registration_cases
              SET status=$2,last_error_code=$3,last_error_message=$3,
                  next_attempt_at=now()+make_interval(secs=>$4),
                  lease_until=NULL,locked_by=NULL,updated_at=now(),version=version+1
            WHERE id=$1 AND locked_by=$5`,
          [claimed.caseId,nextStatus,message.slice(0,120),nextAttemptSeconds,actor.requestId]
        );
        await client.query(
          `INSERT INTO guest_registration_attempts(
             id,registration_case_id,request_digest,response_metadata,attempt_status
           ) VALUES(gen_random_uuid(),$1,$2,'{}'::jsonb,'failed')`,
          [claimed.caseId,createHash("sha256").update(claimed.caseId+":"+claimed.attempt).digest("hex")]
        );
      });
      throw error;
    }
  }
}

