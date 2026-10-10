import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {idempotentMarketAssignment} from "./market-assignment-idempotent";
import {authorizedMarketTerminalTransition} from "./market-status-authorized";
type MarketPriority="normal"|"high"|"urgent";

/**
 * Internal-only write service. Callers must be authenticated by the global
 * signed internal actor guard; PostgreSQL actor context is set by withActor.
 * No public routes are registered here.
 */
@Injectable()
export class MarketStaffCommandService{
 constructor(private readonly db:DatabaseService){}
 assign(actor:RequestActorContext,input:{
  propertyId:string;orderId:string;assigneeMembershipId:string;
  priority:MarketPriority;dueAt:string;expectedVersion:number;idempotencyKey:string;
 }){
  return this.db.withActor(actor,client=>idempotentMarketAssignment(client,{
   organizationId:actor.organizationId,propertyId:input.propertyId,
   orderId:input.orderId,actorMembershipId:actor.membershipId,
   assigneeMembershipId:input.assigneeMembershipId,priority:input.priority,
   dueAt:input.dueAt,expectedVersion:input.expectedVersion,idempotencyKey:input.idempotencyKey
  }));
 }
 transition(actor:RequestActorContext,input:{
  propertyId:string;orderId:string;action:"delivered"|"cancelled";
  expectedVersion:number;idempotencyKey:string;
 }){
  return this.db.withActor(actor,client=>authorizedMarketTerminalTransition(client,{
   organizationId:actor.organizationId,propertyId:input.propertyId,
   orderId:input.orderId,actorMembershipId:actor.membershipId,
   action:input.action,expectedVersion:input.expectedVersion,
   idempotencyKey:input.idempotencyKey
  }));
 }
}
