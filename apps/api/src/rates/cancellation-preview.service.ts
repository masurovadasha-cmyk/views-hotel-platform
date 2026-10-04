import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {calculateCancellationRefund,type CancellationPolicySnapshot} from "./cancellation";

@Injectable()
export class CancellationPreviewService{
  constructor(private readonly db:DatabaseService){}

  async preview(actor:RequestActorContext,reservationId:string,requestedAt=new Date().toISOString()){
    return this.db.withActor(actor,async client=>{
      const result=await client.query<{
        property_id:string;status:string;check_in_at:Date;cancellation_policy_snapshot:CancellationPolicySnapshot;
      }>(
        `SELECT property_id,status,check_in_at,cancellation_policy_snapshot
           FROM reservations WHERE id=$1`,
        [reservationId]
      );
      const reservation=result.rows[0];
      if(!reservation)throw new Error("RESERVATION_NOT_FOUND");

      const access=await client.query<{allowed:boolean}>(
        "SELECT app.can_access_property($1::uuid) AS allowed",[reservation.property_id]
      );
      if(!access.rows[0]?.allowed)throw new Error("PROPERTY_FORBIDDEN");
      if(!["confirmed","checked_in"].includes(reservation.status))throw new Error("CANCELLATION_NOT_AVAILABLE");

      const lines=await client.query<{code:string|null;amount_minor:string;refundable:boolean}>(
        `SELECT code,amount_minor::text,refundable
           FROM reservation_price_lines WHERE reservation_id=$1 ORDER BY sort_order,id`,
        [reservationId]
      );

      const calculation=calculateCancellationRefund({
        policy:reservation.cancellation_policy_snapshot,
        requestedAt,
        checkInAt:reservation.check_in_at.toISOString(),
        lines:lines.rows.map(x=>({
          code:x.code??"uncoded",
          amountMinor:BigInt(x.amount_minor),
          refundable:x.refundable
        }))
      });

      return {
        reservationId,
        requestedAt,
        checkInAt:reservation.check_in_at.toISOString(),
        policy:reservation.cancellation_policy_snapshot,
        ...calculation
      };
    });
  }
}
