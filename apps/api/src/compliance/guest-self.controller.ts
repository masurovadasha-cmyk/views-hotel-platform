import {
  BadRequestException,Body,ConflictException,Controller,Get,Headers,
  NotFoundException,Param,Post,ServiceUnavailableException,UnauthorizedException
} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {GuestAccessService} from "./guest-access.service";
import {GuestSelfService} from "./guest-self.service";

@Controller("v1/guest")
export class GuestSelfController{
  constructor(
    private readonly access:GuestAccessService,
    private readonly guest:GuestSelfService
  ){}

  @Get("session")
  async session(@Headers("authorization") authorization:string|undefined){
    try{
      const scope=await this.access.resolve(bearerToken(authorization));
      return await this.guest.summary(scope);
    }catch(error){throw mapGuestSelfError(error)}
  }

  @Post("documents/reservation-guests/:id/uploads")
  async beginUpload(
    @Param("id") id:string,
    @Body() body:{
      documentType?:string;contentType?:string;issuingCountryCode?:string;
      expiresOn?:string;maxBytes?:number;
    },
    @Headers("authorization") authorization:string|undefined
  ){
    try{
      if(!body.documentType||!body.contentType){
        throw new BadRequestException("documentType and contentType are required");
      }
      const scope=await this.access.resolve(bearerToken(authorization));
      return await this.guest.beginDocumentUpload(
        scope,
        requireUuid(id,"reservation_guest_id"),
        {
          documentType:body.documentType,
          contentType:body.contentType,
          issuingCountryCode:body.issuingCountryCode,
          expiresOn:body.expiresOn,
          maxBytes:body.maxBytes
        }
      );
    }catch(error){throw mapGuestSelfError(error)}
  }

  @Post("documents/:id/finalize")
  async finalizeUpload(
    @Param("id") id:string,
    @Headers("authorization") authorization:string|undefined
  ){
    try{
      const scope=await this.access.resolve(bearerToken(authorization));
      return await this.guest.finalizeDocumentUpload(
        scope,requireUuid(id,"document_record_id")
      );
    }catch(error){throw mapGuestSelfError(error)}
  }
}

function bearerToken(authorization?:string){
  const value=String(authorization||"").trim();
  const match=/^Bearer\s+([^\s]+)$/i.exec(value);
  if(!match)throw new UnauthorizedException("guest access token required");
  return match[1];
}

function mapGuestSelfError(error:unknown){
  if(
    error instanceof BadRequestException||
    error instanceof UnauthorizedException||
    error instanceof NotFoundException||
    error instanceof ConflictException||
    error instanceof ServiceUnavailableException
  )return error;

  const message=error instanceof Error?error.message:"GUEST_SELF_SERVICE_ERROR";
  if(message==="GUEST_ACCESS_UNAUTHORIZED")return new UnauthorizedException(message);
  if(["RESERVATION_GUEST_NOT_FOUND","DOCUMENT_RECORD_NOT_FOUND"].includes(message)){
    return new NotFoundException(message);
  }
  if([
    "REGISTRATION_POLICY_NOT_CONFIGURED","DATA_RESIDENCY_POLICY_NOT_CONFIGURED",
    "DOCUMENT_STORAGE_REGION_UNRESOLVED","DOCUMENT_VAULT_NOT_CONNECTED",
    "DOCUMENT_UPLOAD_NOT_SUPPORTED"
  ].includes(message))return new ServiceUnavailableException(message);
  if(["DOCUMENT_ALREADY_VERIFIED","DOCUMENT_UPLOAD_NOT_AVAILABLE"].includes(message)){
    return new ConflictException(message);
  }
  if(message.startsWith("INVALID_"))return new BadRequestException(message);
  return new BadRequestException(message);
}
