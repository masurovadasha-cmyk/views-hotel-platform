import {calendarDaysBetween,enumerateStayDates,isoWeekday} from "./local-date";
import type {AdjustmentRule,ChargeRule,PricingInput,PricingResult,QuoteLine} from "./pricing.types";

function bps(amount:bigint,points:number){
  return (amount*BigInt(points))/10000n;
}

function effectiveOn(arrival:string,rule:{effectiveFrom:string|null;effectiveTo:string|null}){
  return (!rule.effectiveFrom||arrival>=rule.effectiveFrom)&&(!rule.effectiveTo||arrival<=rule.effectiveTo);
}

function qualifyingAdjustment(rule:AdjustmentRule,nights:number,daysBeforeArrival:number,arrival:string){
  if(!effectiveOn(arrival,rule))return false;
  if(rule.triggerKind==="length_of_stay")return nights>=(rule.minNights??1);
  if(rule.triggerKind==="early_booking"){
    if(rule.minDaysBeforeArrival!==null&&daysBeforeArrival<rule.minDaysBeforeArrival)return false;
    if(rule.maxDaysBeforeArrival!==null&&daysBeforeArrival>rule.maxDaysBeforeArrival)return false;
    return true;
  }
  if(rule.triggerKind==="last_minute"){
    if(rule.minDaysBeforeArrival!==null&&daysBeforeArrival<rule.minDaysBeforeArrival)return false;
    if(rule.maxDaysBeforeArrival!==null&&daysBeforeArrival>rule.maxDaysBeforeArrival)return false;
    return true;
  }
  return false;
}

function selectedAdjustments(rules:AdjustmentRule[],nights:number,daysBeforeArrival:number,arrival:string){
  const qualified=rules.filter(x=>qualifyingAdjustment(x,nights,daysBeforeArrival,arrival)).sort((a,b)=>a.priority-b.priority||a.code.localeCompare(b.code));
  const exclusive=qualified.find(x=>!x.stackable);
  return exclusive?[exclusive]:qualified;
}

function chargeAmount(rule:ChargeRule,netAccommodation:bigint,nights:number,guests:PricingInput["guests"],currency:string){
  if(rule.ruleKind==="percent_of_accommodation"){
    if(rule.rateBps===null||rule.rateBps<0)throw new Error("INVALID_PERCENT_CHARGE");
    return bps(netAccommodation,rule.rateBps);
  }
  if(rule.amountMinor===null||rule.amountMinor<0n)throw new Error("INVALID_FIXED_CHARGE");
  if(rule.currency!==currency)throw new Error("CHARGE_CURRENCY_MISMATCH");
  if(rule.ruleKind==="fixed_per_booking")return rule.amountMinor;

  const eligible=guests.filter(g=>{
    if(rule.minAge!==null&&g.age<rule.minAge)return false;
    if(rule.residency==="all")return true;
    return g.residency===rule.residency;
  }).length;
  return rule.amountMinor*BigInt(eligible*nights);
}

export function priceStay(input:PricingInput):PricingResult{
  if(input.baseNightlyMinor<0n)throw new Error("INVALID_BASE_RATE");
  if(!/^[A-Z]{3}$/.test(input.currency))throw new Error("INVALID_CURRENCY");
  const {dates,arrivalDate,departureDate}=enumerateStayDates(input.checkInAt,input.checkOutAt,input.propertyTimezone);
  const dayMap=new Map(input.dayOverrides.map(x=>[x.stayDate,x]));
  const weekMap=new Map(input.weekdayRules.map(x=>[x.isoWeekday,x]));
  const arrivalOverride=dayMap.get(arrivalDate),departureOverride=dayMap.get(departureDate);
  const arrivalWeek=weekMap.get(isoWeekday(arrivalDate)),departureWeek=weekMap.get(isoWeekday(departureDate));

  if(arrivalOverride?.closedToArrival||arrivalWeek?.closedToArrival)throw new Error("CLOSED_TO_ARRIVAL");
  if(departureOverride?.closedToDeparture||departureWeek?.closedToDeparture)throw new Error("CLOSED_TO_DEPARTURE");

  const minStay=Math.max(1,...dates.flatMap(date=>{
    const day=dayMap.get(date),week=weekMap.get(isoWeekday(date));
    return [day?.minStay??1,week?.minStay??1];
  }));
  if(dates.length<minStay)throw new Error("MIN_STAY_NOT_MET");

  const lines:QuoteLine[]=[];
  let accommodation=0n;
  dates.forEach((date,index)=>{
    const day=dayMap.get(date),week=weekMap.get(isoWeekday(date));
    if(day?.closed||week?.closed)throw new Error("DATE_CLOSED");
    let nightly=day?.nightlyMinor??week?.nightlyMinor??input.baseNightlyMinor;
    if(day?.nightlyMinor===null&&week?.nightlyMinor===null&&week?.priceDeltaBps){
      nightly+=bps(nightly,week.priceDeltaBps);
    }else if(day?.nightlyMinor===undefined&&week?.nightlyMinor===null&&week?.priceDeltaBps){
      nightly+=bps(nightly,week.priceDeltaBps);
    }
    if(nightly<0n)throw new Error("NEGATIVE_NIGHTLY_RATE");
    accommodation+=nightly;
    lines.push({
      lineType:"night",code:"night:"+date,label:{en:"Night "+date,ru:"Ночь "+date,uz:"Tun "+date},
      amountMinor:nightly,refundable:true,metadata:{stayDate:date},sortOrder:index
    });
  });

  const daysBeforeArrival=calendarDaysBetween(input.bookedAt,arrivalDate,input.propertyTimezone);
  if(daysBeforeArrival<0)throw new Error("ARRIVAL_IN_PAST");
  let remaining=accommodation,discount=0n;
  const adjustments=selectedAdjustments(input.adjustments,dates.length,daysBeforeArrival,arrivalDate);
  adjustments.forEach((rule,index)=>{
    let amount=rule.adjustmentKind==="percentage"
      ?bps(remaining,rule.amountBps??0)
      :(rule.amountMinor??0n);
    if(amount<0n)throw new Error("NEGATIVE_DISCOUNT");
    if(amount>remaining)amount=remaining;
    remaining-=amount;discount+=amount;
    lines.push({
      lineType:"discount",code:rule.code,label:{en:rule.code,ru:rule.code,uz:rule.code},
      amountMinor:-amount,refundable:true,
      metadata:{triggerKind:rule.triggerKind,adjustmentKind:rule.adjustmentKind},sortOrder:100+index
    });
  });

  let charges=0n;
  input.charges.forEach((rule,index)=>{
    const amount=chargeAmount(rule,remaining,dates.length,input.guests,input.currency);
    charges+=amount;
    lines.push({
      lineType:"charge",code:rule.code,label:rule.label,amountMinor:amount,
      refundable:false,metadata:{ruleKind:rule.ruleKind,residency:rule.residency,minAge:rule.minAge},sortOrder:200+index
    });
  });

  return {
    nights:dates.length,accommodationMinor:accommodation,discountMinor:discount,chargesMinor:charges,
    totalMinor:remaining+charges,lines,
    pricingSnapshot:{
      propertyTimezone:input.propertyTimezone,arrivalDate,departureDate,daysBeforeArrival,minStay,
      nightlyDates:dates,appliedAdjustments:adjustments.map(x=>x.code),chargeCodes:input.charges.map(x=>x.code)
    }
  };
}
