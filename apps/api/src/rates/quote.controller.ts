import {BadRequestException,Body,Controller,ForbiddenException,Headers,NotFoundException,Post,UnauthorizedException} from "@nestjs/common";
import {requireUuid} from "../identity/actor-context";
import {QuoteService} from "./quote.service";

type QuoteBody={
  propertyId?:string;unitId?:string;ratePlanId?:string;checkInAt?:string;checkOutAt?:string;
  guests?:Array<{age?:number;residency?:"resident"|"nonresident"}>;
};

@Controller("v1/quotes")
export class QuoteController{
  constructor(private readonly quotes:QuoteService){}

  @Post()
  async create(
    @Headers("x-organization-id") organizationId:string|undefined,
    @Headers("x-user-id") userId:string|undefined,
    @Headers("x-membership-id") membershipId:string|undefined,
    @Headers("x-request-id") requestId:string|undefined,
    @Headers("x-market-segment") marketSegment:string|undefined,
    @Body() body:QuoteBody
  ){
    try{
      const actor={
        organizationId:requireUuid(organizationId,"organization_id"),
        userId:requireUuid(userId,"user_id"),
        membershipId:requireUuid(membershipId,"membership_id"),
        requestId:requestId||crypto.randomUUID()
      };
      if(!body.propertyId||!body.unitId||!body.ratePlanId||!body.checkInAt||!body.checkOutAt||!body.guests){
        throw new BadRequestException("Incomplete quote request");
      }
      const result=await this.quotes.createQuote({
        actor,
        propertyId:requireUuid(body.propertyId,"property_id"),
        unitId:requireUuid(body.unitId,"unit_id"),
        ratePlanId:requireUuid(body.ratePlanId,"rate_plan_id"),
        checkInAt:body.checkInAt,checkOutAt:body.checkOutAt,
        guests:body.guests.map(x=>({
          age:Number(x.age),
          residency:x.residency==="nonresident"?"nonresident":"resident"
        })),
        attribution:{
          bookingChannel:"staff_crm",
          marketSegment,
          source:"staff_actor"
        }
      });
      return JSON.parse(JSON.stringify(result,(_,v)=>typeof v==="bigint"?v.toString():v));
    }catch(error){
      if(error instanceof BadRequestException)return Promise.reject(error);
      if(error instanceof Error&&error.message==="PROPERTY_FORBIDDEN")throw new ForbiddenException(error.message);
      if(error instanceof Error&&error.message==="UNIT_OR_RATE_NOT_FOUND")throw new NotFoundException(error.message);
      if(error instanceof Error&&error.message==="UNIT_NOT_AVAILABLE")throw new BadRequestException(error.message);
      if(error instanceof Error&&error.message.startsWith("INVALID_"))throw new BadRequestException(error.message);
      if(error instanceof Error&&error.message==="CANCELLATION_POLICY_REQUIRED")throw new BadRequestException(error.message);
      if(error instanceof Error&&error.message.includes("CLOSED"))throw new BadRequestException(error.message);
      if(error instanceof Error&&error.message==="MIN_STAY_NOT_MET")throw new BadRequestException(error.message);
      if(error instanceof Error&&error.message==="GUESTS_REQUIRED")throw new BadRequestException(error.message);
      if(error instanceof Error&&error.message==="valid actor context required")throw new UnauthorizedException(error.message);
      throw error;
    }
  }
}
