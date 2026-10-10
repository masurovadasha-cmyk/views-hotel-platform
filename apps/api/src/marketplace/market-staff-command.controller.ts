import {Body,Controller,Headers,Param,Post,BadRequestException,UnauthorizedException,ForbiddenException,ConflictException} from "@nestjs/common";
import {randomUUID} from "node:crypto";
import {requireUuid} from "../identity/actor-context";
import {MarketStaffCommandService} from "./market-staff-command.service";

@Controller("v1/internal/market")
export class MarketStaffCommandController{
 constructor(private readonly commands:MarketStaffCommandService){}
 private actor(org?:string,user?:string,membership?:string,requestId?:string){
  try{return {organizationId:requireUuid(org,"organization_id"),userId:requireUuid(user,"user_id"),membershipId:requireUuid(membership,"membership_id"),requestId:requestId||randomUUID()}}
  catch{throw new UnauthorizedException("trusted actor context required")}
 }
 private key(value?:string){
  if(!value||value.trim().length<1||value.length>160)throw new BadRequestException("Idempotency-Key required");
  return value;
 }
 private version(value:unknown){
  if(typeof value!=="number"||!Number.isSafeInteger(value)||value<1)throw new BadRequestException("invalid expectedVersion");
  return value;
 }
 private uuid(value:unknown,name:string){
  try{return requireUuid(typeof value==="string"?value:undefined,name)}
  catch{throw new BadRequestException("invalid "+name)}
 }
 private map(error:unknown):never{
  const code=error instanceof Error?error.message:"";
  if(code.includes("FORBIDDEN"))throw new ForbiddenException("market permission denied");
  if(code.includes("CONFLICT")||code.includes("TERMINAL"))throw new ConflictException(code);
  throw error;
 }
 @Post("properties/:propertyId/orders/:orderId/assignment")
 async assign(
  @Param("propertyId") propertyId:string,@Param("orderId") orderId:string,
  @Headers("x-organization-id") org:string|undefined,@Headers("x-user-id") user:string|undefined,
  @Headers("x-membership-id") membership:string|undefined,@Headers("x-request-id") requestId:string|undefined,
  @Headers("idempotency-key") idempotencyKey:string|undefined,@Body() body:Record<string,unknown>
 ){
  const actor=this.actor(org,user,membership,requestId);
  const property=this.uuid(propertyId,"property_id"),order=this.uuid(orderId,"order_id");
  const assignee=this.uuid(body?.assigneeMembershipId,"assignee_membership_id");
  const priority=body?.priority;
  if(priority!=="normal"&&priority!=="high"&&priority!=="urgent")throw new BadRequestException("invalid priority");
  if(typeof body?.dueAt!=="string"||!Number.isFinite(Date.parse(body.dueAt)))throw new BadRequestException("invalid dueAt");
  try{return await this.commands.assign(actor,{propertyId:property,orderId:order,assigneeMembershipId:assignee,priority,dueAt:body.dueAt,expectedVersion:this.version(body.expectedVersion),idempotencyKey:this.key(idempotencyKey)})}
  catch(error){this.map(error)}
 }
 @Post("properties/:propertyId/orders/:orderId/status")
 async status(
  @Param("propertyId") propertyId:string,@Param("orderId") orderId:string,
  @Headers("x-organization-id") org:string|undefined,@Headers("x-user-id") user:string|undefined,
  @Headers("x-membership-id") membership:string|undefined,@Headers("x-request-id") requestId:string|undefined,
  @Headers("idempotency-key") idempotencyKey:string|undefined,@Body() body:Record<string,unknown>
 ){
  const actor=this.actor(org,user,membership,requestId);
  const property=this.uuid(propertyId,"property_id"),order=this.uuid(orderId,"order_id");
  if(body?.action!=="delivered"&&body?.action!=="cancelled")throw new BadRequestException("invalid terminal action");
  try{return await this.commands.transition(actor,{propertyId:property,orderId:order,action:body.action,expectedVersion:this.version(body.expectedVersion),idempotencyKey:this.key(idempotencyKey)})}
  catch(error){this.map(error)}
 }
}
