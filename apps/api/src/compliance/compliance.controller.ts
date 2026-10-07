import {
  BadRequestException,Body,ConflictException,Controller,ForbiddenException,Get,Headers,NotFoundException,Param,Post,Query,ServiceUnavailableException,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {FiscalizationService} from "./fiscalization.service";
import {GuestDocumentService} from "./guest-document.service";
import {GuestRegistrationService} from "./guest-registration.service";
import {ComplianceProviderRegistry} from "./provider.registry";

@Controller("v1/compliance")
export class ComplianceController{
  constructor(
    private readonly registrations:GuestRegistrationService,
    private readonly documents:GuestDocumentService,
    private readonly fiscalization:FiscalizationService,
    private readonly providers:ComplianceProviderRegistry
  ){}

  @Get("providers")
  providersStatus(){return this.providers.connected()}

  @Post("documents/reservation-guests/:id/uploads")
  async beginDocumentUpload(
    @Param("id") id:string,
    @Body() body:{
      documentType?:string;contentType?:string;issuingCountryCode?:string;
      expiresOn?:string;maxBytes?:number;
    },
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      if(!body.documentType||!body.contentType)throw new BadRequestException("documentType and contentType are required");
      return await this.documents.beginUpload(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"reservation_guest_id"),
        {
          documentType:body.documentType,contentType:body.contentType,
          issuingCountryCode:body.issuingCountryCode,expiresOn:body.expiresOn,maxBytes:body.maxBytes
        }
      );
    }catch(error){throw mapComplianceError(error)}
  }

  @Post("documents/:id/finalize")
  async finalizeDocumentUpload(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.documents.finalizeUpload(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"document_record_id")
      );
    }catch(error){throw mapComplianceError(error)}
  }

  @Post("documents/:id/verify")
  async verifyDocument(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.documents.verify(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"document_record_id")
      );
    }catch(error){throw mapComplianceError(error)}
  }

  @Post("registrations/reservations/:id/prepare")
  async prepareRegistration(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.registrations.prepareReservation(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"reservation_id")
      );
    }catch(error){throw mapComplianceError(error)}
  }

  @Get("registrations")
  async registrationQueue(
    @Query("propertyId") propertyId:string|undefined,
    @Query("status") status:string|undefined,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      if(!propertyId)throw new BadRequestException("propertyId is required");
      return await this.registrations.listQueue(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(propertyId,"property_id"),
        status
      );
    }catch(error){throw mapComplianceError(error)}
  }

  @Post("registrations/:id/submit")
  async submitRegistration(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.registrations.submitNow(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"registration_case_id")
      );
    }catch(error){throw mapComplianceError(error)}
  }

  @Post("fiscalization/provider-transactions/:id/prepare")
  async prepareFiscalization(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      const result=await this.fiscalization.prepareFromProviderTransaction(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"provider_transaction_id")
      );
      return JSON.parse(JSON.stringify(result,(_,v)=>typeof v==="bigint"?v.toString():v));
    }catch(error){throw mapComplianceError(error)}
  }

  @Post("fiscalization/:id/submit")
  async submitFiscalization(
    @Param("id") id:string,
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined
  ){
    try{
      return await this.fiscalization.submitNow(
        actorFromHeaders(organizationId,userId,membershipId,requestId),
        requireUuid(id,"fiscalization_request_id")
      );
    }catch(error){throw mapComplianceError(error)}
  }
}

function actorFromHeaders(
  organizationId?:string,userId?:string,membershipId?:string,requestId?:string
){
  try{
    return {
      organizationId:requireUuid(organizationId,"organization_id"),
      userId:requireUuid(userId,"user_id"),
      membershipId:requireUuid(membershipId,"membership_id"),
      requestId:requestId||crypto.randomUUID()
    };
  }catch{throw new UnauthorizedException("valid actor context required")}
}

function mapComplianceError(error:unknown){
  if(
    error instanceof BadRequestException||
    error instanceof UnauthorizedException||
    error instanceof ForbiddenException||
    error instanceof NotFoundException||
    error instanceof ServiceUnavailableException
  )return error;

  const message=error instanceof Error?error.message:"COMPLIANCE_ERROR";
  if(message==="SYNTHETIC_REGISTRATION_FORBIDDEN"||message==="PROPERTY_FORBIDDEN"||message==="COMPLIANCE_ROLE_FORBIDDEN"){
    return new ForbiddenException(message);
  }
  if([
    "RESERVATION_NOT_FOUND","RESERVATION_GUEST_NOT_FOUND","DOCUMENT_RECORD_NOT_FOUND",
    "REGISTRATION_CASE_NOT_FOUND","FISCALIZATION_REQUEST_NOT_FOUND","PROVIDER_TRANSACTION_NOT_FOUND"
  ].includes(message))return new NotFoundException(message);

  if([
    "REGISTRATION_PROVIDER_NOT_CONNECTED","DOCUMENT_VAULT_NOT_CONNECTED",
    "DOCUMENT_UPLOAD_NOT_SUPPORTED","REGISTRATION_POLICY_NOT_CONFIGURED",
    "DATA_RESIDENCY_POLICY_NOT_CONFIGURED","DOCUMENT_STORAGE_REGION_UNRESOLVED",
    "FISCALIZATION_PROVIDER_NOT_CONNECTED"
  ].includes(message))return new ServiceUnavailableException(message);

  if([
    "DOCUMENT_ALREADY_VERIFIED","DOCUMENT_NOT_PENDING","DOCUMENT_FINALIZE_CONFLICT","DOCUMENT_EXPIRED","DOCUMENT_REVIEW_NOT_AVAILABLE","REGISTRATION_CASE_BUSY","FISCALIZATION_REQUEST_BUSY"
  ].includes(message))return new ConflictException(message);

  return new BadRequestException(message);
}
