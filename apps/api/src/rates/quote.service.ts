import {createHash,randomUUID} from "node:crypto";
import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import {validateCancellationPolicy,type CancellationPolicySnapshot} from "./cancellation";
import {enumerateStayDates} from "./local-date";
import {priceStay} from "./pricing.engine";
import type {AdjustmentRule,ChargeRule,DayOverride,WeekdayRule} from "./pricing.types";
import type {CreateQuoteInput,QuoteResult} from "./quote.types";

const QUOTE_TTL_SECONDS=600;

function hashInput(input:CreateQuoteInput){
  const stable=JSON.stringify({
    propertyId:input.propertyId,unitId:input.unitId,ratePlanId:input.ratePlanId,
    checkInAt:input.checkInAt,checkOutAt:input.checkOutAt,
    guests:[...input.guests].sort((a,b)=>a.age-b.age||a.residency.localeCompare(b.residency))
  });
  return createHash("sha256").update(stable).digest("hex");
}

@Injectable()
export class QuoteService{
  constructor(private readonly db:DatabaseService){}

  async createQuote(input:CreateQuoteInput):Promise<QuoteResult>{
    if(!input.guests.length)throw new Error("GUESTS_REQUIRED");
    for(const guest of input.guests){
      if(!Number.isInteger(guest.age)||guest.age<0||guest.age>130)throw new Error("INVALID_GUEST_AGE");
    }

    return this.db.withActor(input.actor,async client=>{
      const access=await client.query<{allowed:boolean}>("SELECT app.can_access_property($1::uuid) AS allowed",[input.propertyId]);
      if(!access.rows[0]?.allowed)throw new Error("PROPERTY_FORBIDDEN");

      const core=await client.query<{
        timezone:string;country_code:string;region_code:string|null;currency:string;base_nightly_minor:string;
        cancellation_rules:unknown|null;
      }>(
        `SELECT p.timezone,p.country_code,p.region_code,rp.currency,rp.base_nightly_minor::text,
                cp.rules AS cancellation_rules
           FROM units u
           JOIN properties p ON p.id=u.property_id
           JOIN rate_plans rp ON rp.id=$3 AND rp.property_id=p.id AND rp.unit_type_id=u.unit_type_id AND rp.active=true
           LEFT JOIN cancellation_policy_templates cp ON cp.id=rp.cancellation_policy_id AND cp.active=true
          WHERE u.id=$1 AND p.id=$2 AND u.status='active'`,
        [input.unitId,input.propertyId,input.ratePlanId]
      );
      const row=core.rows[0];
      if(!row)throw new Error("UNIT_OR_RATE_NOT_FOUND");
      if(!row.cancellation_rules)throw new Error("CANCELLATION_POLICY_REQUIRED");

      const conflict=await client.query<{conflict:boolean}>(
        `SELECT EXISTS(
          SELECT 1 FROM inventory_periods
          WHERE unit_id=$1
            AND stay_period && tstzrange($2::timestamptz,$3::timestamptz,'[)')
            AND (expires_at IS NULL OR expires_at>now())
        ) AS conflict`,
        [input.unitId,input.checkInAt,input.checkOutAt]
      );
      if(conflict.rows[0].conflict)throw new Error("UNIT_NOT_AVAILABLE");

      const {arrivalDate,departureDate}=enumerateStayDates(input.checkInAt,input.checkOutAt,row.timezone);

      const [dayResult,weekdayResult,adjustmentResult,chargeResult]=await Promise.all([
        client.query<{
          stay_date:string;nightly_minor:string|null;min_stay:number|null;closed:boolean;closed_to_arrival:boolean;closed_to_departure:boolean;
        }>(
          `SELECT stay_date::text,nightly_minor::text,min_stay,closed,closed_to_arrival,closed_to_departure
           FROM rate_day_overrides WHERE rate_plan_id=$1 AND stay_date BETWEEN $2::date AND $3::date`,
          [input.ratePlanId,arrivalDate,departureDate]
        ),
        client.query<{
          iso_weekday:number;nightly_minor:string|null;price_delta_bps:number|null;min_stay:number|null;
          closed:boolean;closed_to_arrival:boolean;closed_to_departure:boolean;
        }>(
          `SELECT iso_weekday,nightly_minor::text,price_delta_bps,min_stay,closed,closed_to_arrival,closed_to_departure
           FROM rate_weekday_rules WHERE rate_plan_id=$1`,
          [input.ratePlanId]
        ),
        client.query<{
          code:string;trigger_kind:AdjustmentRule["triggerKind"];adjustment_kind:AdjustmentRule["adjustmentKind"];
          amount_bps:number|null;amount_minor:string|null;min_nights:number|null;min_days_before_arrival:number|null;
          max_days_before_arrival:number|null;priority:number;stackable:boolean;effective_from:string|null;effective_to:string|null;
        }>(
          `SELECT code,trigger_kind,adjustment_kind,amount_bps,amount_minor::text,min_nights,min_days_before_arrival,
                  max_days_before_arrival,priority,stackable,effective_from::text,effective_to::text
             FROM rate_adjustments WHERE rate_plan_id=$1 AND active=true ORDER BY priority,code`,
          [input.ratePlanId]
        ),
        client.query<{
          property_id:string|null;code:string;label:Record<string,string>;rule_kind:ChargeRule["ruleKind"];
          rate_bps:number|null;amount_minor:string|null;currency:string|null;residency:ChargeRule["residency"];
          min_age:number|null;effective_from:string;compliance_policy_id:string|null;metadata:Record<string,unknown>;
        }>(
          `SELECT property_id::text,code,label,rule_kind,rate_bps,amount_minor::text,currency,residency,min_age,
                  effective_from::text,compliance_policy_id::text,metadata
             FROM charge_rules
            WHERE organization_id=$1
              AND active=true
              AND country_code=$2
              AND (property_id IS NULL OR property_id=$3)
              AND (region_code IS NULL OR region_code=$4)
              AND effective_from<=$5::date
              AND (effective_to IS NULL OR effective_to>=$5::date)
            ORDER BY code,(property_id IS NOT NULL) DESC,effective_from DESC`,
          [input.actor.organizationId,row.country_code,input.propertyId,row.region_code,arrivalDate]
        )
      ]);

      const days:DayOverride[]=dayResult.rows.map(x=>({
        stayDate:x.stay_date,nightlyMinor:x.nightly_minor===null?null:BigInt(x.nightly_minor),minStay:x.min_stay,
        closed:x.closed,closedToArrival:x.closed_to_arrival,closedToDeparture:x.closed_to_departure
      }));
      const weekdays:WeekdayRule[]=weekdayResult.rows.map(x=>({
        isoWeekday:x.iso_weekday,nightlyMinor:x.nightly_minor===null?null:BigInt(x.nightly_minor),
        priceDeltaBps:x.price_delta_bps,minStay:x.min_stay,closed:x.closed,
        closedToArrival:x.closed_to_arrival,closedToDeparture:x.closed_to_departure
      }));
      const adjustments:AdjustmentRule[]=adjustmentResult.rows.map(x=>({
        code:x.code,triggerKind:x.trigger_kind,adjustmentKind:x.adjustment_kind,amountBps:x.amount_bps,
        amountMinor:x.amount_minor===null?null:BigInt(x.amount_minor),minNights:x.min_nights,
        minDaysBeforeArrival:x.min_days_before_arrival,maxDaysBeforeArrival:x.max_days_before_arrival,
        priority:x.priority,stackable:x.stackable,effectiveFrom:x.effective_from,effectiveTo:x.effective_to
      }));

      const seen=new Set<string>();
      const charges:ChargeRule[]=[];
      for(const x of chargeResult.rows){
        if(seen.has(x.code))continue;
        seen.add(x.code);
        charges.push({
          code:x.code,label:x.label,ruleKind:x.rule_kind,rateBps:x.rate_bps,
          amountMinor:x.amount_minor===null?null:BigInt(x.amount_minor),currency:x.currency,
          residency:x.residency,minAge:x.min_age,
          compliancePolicyId:x.compliance_policy_id,ruleMetadata:x.metadata
        });
      }

      const rawPolicy=row.cancellation_rules as {
        version?:number;rules?:Array<{minHoursBeforeCheckIn:number;refundBps:number}>;nonRefundableLineCodes?:string[];
      };
      const policy=validateCancellationPolicy({
        version:1,
        propertyTimezone:row.timezone,
        rules:rawPolicy.rules??[],
        nonRefundableLineCodes:rawPolicy.nonRefundableLineCodes??[]
      } satisfies CancellationPolicySnapshot);

      const priced=priceStay({
        checkInAt:input.checkInAt,checkOutAt:input.checkOutAt,propertyTimezone:row.timezone,
        bookedAt:new Date().toISOString(),currency:row.currency,baseNightlyMinor:BigInt(row.base_nightly_minor),
        dayOverrides:days,weekdayRules:weekdays,adjustments,charges,guests:input.guests
      });

      const quoteId=randomUUID(),expiresAt=new Date(Date.now()+QUOTE_TTL_SECONDS*1000);
      const inputHash=hashInput(input);
      await client.query(
        `INSERT INTO booking_quotes(
          id,organization_id,property_id,unit_id,rate_plan_id,check_in_at,check_out_at,guest_context,currency,
          accommodation_minor,discount_minor,charges_minor,total_minor,cancellation_policy_snapshot,pricing_snapshot,input_hash,expires_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17)`,
        [
          quoteId,input.actor.organizationId,input.propertyId,input.unitId,input.ratePlanId,input.checkInAt,input.checkOutAt,
          JSON.stringify({guests:input.guests}),row.currency,priced.accommodationMinor.toString(),priced.discountMinor.toString(),
          priced.chargesMinor.toString(),priced.totalMinor.toString(),JSON.stringify(policy),JSON.stringify(priced.pricingSnapshot),
          inputHash,expiresAt
        ]
      );

      for(const line of priced.lines){
        await client.query(
          `INSERT INTO booking_quote_lines(id,quote_id,line_type,code,label,amount_minor,currency,refundable,metadata,sort_order)
           VALUES(gen_random_uuid(),$1,$2,$3,$4::jsonb,$5,$6,$7,$8::jsonb,$9)`,
          [
            quoteId,line.lineType,line.code,JSON.stringify(line.label),line.amountMinor.toString(),row.currency,line.refundable,
            JSON.stringify(line.metadata),line.sortOrder
          ]
        );
      }

      return {
        quoteId,currency:row.currency,nights:priced.nights,accommodationMinor:priced.accommodationMinor,
        discountMinor:priced.discountMinor,chargesMinor:priced.chargesMinor,totalMinor:priced.totalMinor,
        expiresAt:expiresAt.toISOString(),lines:priced.lines,cancellationPolicy:policy
      };
    });
  }
}
