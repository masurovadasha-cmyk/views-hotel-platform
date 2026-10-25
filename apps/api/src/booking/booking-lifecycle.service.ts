import {createHash} from "node:crypto";
import type {PoolClient} from "pg";
import {Injectable,UnauthorizedException} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import type {RequestActorContext} from "../identity/actor-context";
import {HoldExpiredError,IdempotencyConflictError} from "./booking.errors";

export type ReleaseOptions={recoveryOnly?:boolean;staffSession?:string;propertyId?:string};
export type ReleaseResult={reservationId:string;status:string;holdExpiresAt:string|null;activeHold:boolean;idempotentReplay:boolean;releaseOutcome:'released'|'not_applied'};
type LifecycleResult={reservationId:string;status:"confirmed"|"cancelled";idempotentReplay:boolean};

@Injectable()
export class BookingLifecycleService{
  constructor(private readonly db:DatabaseService){}

  async confirmHold(actor:RequestActorContext,reservationId:string,idempotencyKey:string):Promise<LifecycleResult>{
    return this.db.withActor(actor,async client=>{
      const allowed=await client.query<{allowed:boolean}>(
        `SELECT app.registry_access(organization_id,property_id,'reservation.manage') AS allowed
         FROM reservations WHERE id=$1 AND organization_id=$2`,[reservationId,actor.organizationId]);
      if(!allowed.rows[0])throw new Error('RESERVATION_NOT_FOUND');
      if(!allowed.rows[0].allowed)throw new Error('PROPERTY_FORBIDDEN');
      const command=await client.query<{request_hash:string;result_snapshot:unknown}>(
        `INSERT INTO booking_commands(id,organization_id,idempotency_key,command_type,reservation_id,request_hash)
         VALUES(gen_random_uuid(),$1,$2,'confirm_hold',$3,$4)
         ON CONFLICT(organization_id,idempotency_key,command_type) DO NOTHING
         RETURNING request_hash,result_snapshot`,
        [actor.organizationId,idempotencyKey,reservationId,reservationId]
      );
      if(!command.rowCount){
        const existing=await client.query<{request_hash:string;result_snapshot:{reservationId?:string;status?:string}|null}>(
          "SELECT request_hash,result_snapshot FROM booking_commands WHERE organization_id=$1 AND idempotency_key=$2 AND command_type='confirm_hold'",
          [actor.organizationId,idempotencyKey]
        );
        if(!existing.rows[0])throw new Error("IDEMPOTENCY_STATE_MISSING");
        if(existing.rows[0].request_hash!==reservationId)throw new IdempotencyConflictError();
        if(existing.rows[0].result_snapshot?.status==="confirmed")return {reservationId,status:"confirmed",idempotentReplay:true};
        throw new Error("IDEMPOTENCY_IN_PROGRESS");
      }

      const row=await client.query<{status:string;hold_expires_at:Date|null;property_id:string}>(
        "SELECT status,hold_expires_at,property_id FROM reservations WHERE id=$1 FOR UPDATE",[reservationId]
      );
      const reservation=row.rows[0];
      if(!reservation)throw new Error("RESERVATION_NOT_FOUND");
      const access=await client.query<{allowed:boolean}>("SELECT app.can_access_property($1::uuid) AS allowed",[reservation.property_id]);
      if(!access.rows[0]?.allowed)throw new Error("PROPERTY_FORBIDDEN");
      if(reservation.status!=="hold")throw new Error("RESERVATION_NOT_ON_HOLD");
      if(!reservation.hold_expires_at||reservation.hold_expires_at.getTime()<=Date.now())throw new HoldExpiredError();

      await client.query("UPDATE reservations SET status='confirmed',confirmed_at=now(),hold_expires_at=NULL,updated_at=now(),version=version+1 WHERE id=$1",[reservationId]);
      await client.query("UPDATE inventory_periods SET kind='reservation',expires_at=NULL WHERE reservation_id=$1 AND kind='payment_hold'",[reservationId]);
      await client.query(
        `INSERT INTO booking_state_events(id,organization_id,reservation_id,event_type,from_status,to_status,actor_user_id,idempotency_key,payload)
         VALUES(gen_random_uuid(),$1,$2,'booking.confirmed','hold','confirmed',$3,$4,'{}'::jsonb)`,
        [actor.organizationId,reservationId,actor.userId,idempotencyKey]
      );
      await client.query(
        `INSERT INTO outbox_events(id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
         VALUES(gen_random_uuid(),$1,'reservation',$2,'booking.confirmed',$3,$4::jsonb)`,
        [actor.organizationId,reservationId,"outbox:"+idempotencyKey,JSON.stringify({reservationId})]
      );
      await client.query(
        "UPDATE booking_commands SET result_snapshot=$1::jsonb,completed_at=now() WHERE organization_id=$2 AND idempotency_key=$3 AND command_type='confirm_hold'",
        [JSON.stringify({reservationId,status:"confirmed"}),actor.organizationId,idempotencyKey]
      );
      return {reservationId,status:"confirmed",idempotentReplay:false};
    });
  }

  private async authorizeRelease(client:PoolClient,actor:RequestActorContext,reservationId:string,options:ReleaseOptions){
    const row=(await client.query<{property_id:string;allowed:boolean}>(`SELECT property_id,app.registry_access(organization_id,property_id,'reservation.manage') AS allowed FROM reservations WHERE id=$1 AND organization_id=$2`,[reservationId,actor.organizationId])).rows[0];
    if(!row)throw Error('RESERVATION_NOT_FOUND');
    if(!row.allowed||(options.propertyId&&options.propertyId!==row.property_id))throw Error('PROPERTY_FORBIDDEN');
    if(options.staffSession!==undefined){
      if(!/^[a-f0-9]{64}$/.test(options.staffSession)||!(await client.query('SELECT app.booking_hold_authorize($1,$2) allowed',[createHash('sha256').update(options.staffSession).digest('hex'),row.property_id])).rows[0]?.allowed)throw new UnauthorizedException('STAFF_SESSION_REQUIRED');
    }
  }
  private async releaseReceipt(client:PoolClient,actor:RequestActorContext,reservationId:string,options:ReleaseOptions,releaseOutcome:'released'|'not_applied',idempotentReplay:boolean):Promise<ReleaseResult>{
    const row=(await client.query<{status:string;hold_expires_at:Date|null;active:boolean}>(`SELECT status,hold_expires_at,(status='hold' AND hold_expires_at>clock_timestamp()) active FROM reservations WHERE id=$1 AND organization_id=$2 FOR SHARE`,[reservationId,actor.organizationId])).rows[0];
    await this.authorizeRelease(client,actor,reservationId,options);
    if(!row)throw Error('RESERVATION_NOT_FOUND');
    return {reservationId,status:row.status,holdExpiresAt:row.hold_expires_at?.toISOString()??null,activeHold:row.active===true,idempotentReplay,releaseOutcome};
  }
  async releaseHold(actor:RequestActorContext,reservationId:string,idempotencyKey:string,options:ReleaseOptions={}):Promise<ReleaseResult>{
    return this.db.withActor(actor,async client=>{
      await client.query("SET LOCAL statement_timeout='10s'");
      await this.authorizeRelease(client,actor,reservationId,options);
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[actor.organizationId+':release_hold:'+idempotencyKey]);
      await this.authorizeRelease(client,actor,reservationId,options);
      const existing=(await client.query<{request_hash:string;result_snapshot:{status?:string;notApplied?:boolean}|null}>("SELECT request_hash,result_snapshot FROM booking_commands WHERE organization_id=$1 AND idempotency_key=$2 AND command_type='release_hold'",[actor.organizationId,idempotencyKey])).rows[0];
      if(existing){
        if(existing.request_hash!==reservationId)throw new IdempotencyConflictError();
        if(existing.result_snapshot?.status==='cancelled'||existing.result_snapshot?.notApplied)return this.releaseReceipt(client,actor,reservationId,options,existing.result_snapshot.notApplied?'not_applied':'released',true);
        throw Error('IDEMPOTENCY_IN_PROGRESS');
      }
      await client.query(`INSERT INTO booking_commands(id,organization_id,idempotency_key,command_type,reservation_id,request_hash) VALUES(gen_random_uuid(),$1,$2,'release_hold',$3::uuid,$3::uuid::text)`,[actor.organizationId,idempotencyKey,reservationId]);
      if(options.recoveryOnly){
        await client.query("UPDATE booking_commands SET result_snapshot=$1::jsonb,completed_at=clock_timestamp() WHERE organization_id=$2 AND idempotency_key=$3 AND command_type='release_hold'",[JSON.stringify({reservationId,notApplied:true}),actor.organizationId,idempotencyKey]);
        return this.releaseReceipt(client,actor,reservationId,options,'not_applied',false);
      }
      const row=(await client.query<{status:string}>("SELECT status FROM reservations WHERE id=$1 AND organization_id=$2 FOR UPDATE",[reservationId,actor.organizationId])).rows[0];
      await this.authorizeRelease(client,actor,reservationId,options);
      if(!row)throw Error('RESERVATION_NOT_FOUND');
      if(row.status!=='hold')throw Error('RESERVATION_NOT_ON_HOLD');
      await client.query("DELETE FROM inventory_periods WHERE reservation_id=$1 AND kind='payment_hold'",[reservationId]);
      await client.query("UPDATE reservations SET status='cancelled',cancelled_at=now(),hold_expires_at=NULL,updated_at=now(),version=version+1 WHERE id=$1",[reservationId]);
      await client.query(
        `INSERT INTO booking_state_events(id,organization_id,reservation_id,event_type,from_status,to_status,actor_user_id,idempotency_key,payload)
         VALUES(gen_random_uuid(),$1,$2,'booking.hold_released','hold','cancelled',$3,$4,'{}'::jsonb)`,
        [actor.organizationId,reservationId,actor.userId,idempotencyKey]
      );
      await client.query(
        `INSERT INTO outbox_events(id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
         VALUES(gen_random_uuid(),$1,'reservation',$2,'booking.hold_released',$3,$4::jsonb)`,
        [actor.organizationId,reservationId,"outbox:"+idempotencyKey,JSON.stringify({reservationId})]
      );
      await client.query(
        "UPDATE booking_commands SET result_snapshot=$1::jsonb,completed_at=now() WHERE organization_id=$2 AND idempotency_key=$3 AND command_type='release_hold'",
        [JSON.stringify({reservationId,status:"cancelled"}),actor.organizationId,idempotencyKey]
      );
      return this.releaseReceipt(client,actor,reservationId,options,'released',false);
    });
  }

  async expireTenantBatch(organizationId:string,limit=100){
    if(!Number.isInteger(limit)||limit<1||limit>500)throw new Error("INVALID_BATCH_LIMIT");
    return this.db.withOrganization(organizationId,async client=>{
      const rows=await client.query<{id:string;hold_expires_at:Date}>(
        `SELECT id,hold_expires_at FROM reservations
         WHERE organization_id=$1 AND status='hold' AND hold_expires_at<=now()
         ORDER BY hold_expires_at
         FOR UPDATE SKIP LOCKED
         LIMIT $2`,
        [organizationId,limit]
      );
      for(const reservation of rows.rows){
        const eventKey="expire:"+reservation.id+":"+reservation.hold_expires_at.toISOString();
        await client.query("DELETE FROM inventory_periods WHERE reservation_id=$1 AND kind='payment_hold'",[reservation.id]);
        await client.query("UPDATE reservations SET status='cancelled',cancelled_at=now(),hold_expires_at=NULL,updated_at=now(),version=version+1 WHERE id=$1",[reservation.id]);
        await client.query(
          `INSERT INTO booking_state_events(id,organization_id,reservation_id,event_type,from_status,to_status,idempotency_key,payload)
           VALUES(gen_random_uuid(),$1,$2,'booking.hold_expired','hold','cancelled',$3,'{}'::jsonb)
           ON CONFLICT DO NOTHING`,
          [organizationId,reservation.id,eventKey]
        );
        await client.query(
          `INSERT INTO outbox_events(id,organization_id,aggregate_type,aggregate_id,event_type,idempotency_key,payload)
           VALUES(gen_random_uuid(),$1,'reservation',$2,'booking.hold_expired',$3,$4::jsonb)
           ON CONFLICT(idempotency_key) DO NOTHING`,
          [organizationId,reservation.id,"outbox:"+eventKey,JSON.stringify({reservationId:reservation.id})]
        );
      }
      return {expired:rows.rowCount??0};
    });
  }
}
