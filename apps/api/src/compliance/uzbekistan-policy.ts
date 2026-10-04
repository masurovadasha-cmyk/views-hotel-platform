export const UZBEKISTAN_COMPLIANCE={
  countryCode:"UZ",
  accommodationRegistrationProvider:"emehmon",
  legalReferences:{
    registrationLaw:"O'RQ-1074 / ЗРУ-1074",
    touristFeeRegulation:"Cabinet Resolution 475 (current 2026 amendments)",
    personalDataLaw:"O'RQ-547 / ЗРУ-547 as amended by O'RQ-1125 / ЗРУ-1125"
  }
} as const;

export function isUzbekistanTouristFeeEligible(age:number){
  if(!Number.isInteger(age)||age<0||age>130)throw new Error("INVALID_GUEST_AGE");
  return age>=16;
}

export function uzbekistanTouristFeeResidency(
  residencyCountryCode:string|null|undefined
):"resident"|"nonresident"{
  return residencyCountryCode==="UZ"?"resident":"nonresident";
}

export function defaultGuestDocumentStorageRegion(countryCode:string){
  // Product security default, stricter than the minimum legal localization rule.
  return countryCode==="UZ"?"UZ":"jurisdiction-default";
}

export function registrationDueAt(checkInAt:string,dueHours:number){
  const checkIn=new Date(checkInAt);
  if(!Number.isFinite(checkIn.getTime()))throw new Error("INVALID_CHECK_IN");
  if(!Number.isInteger(dueHours)||dueHours<1||dueHours>240)throw new Error("INVALID_REGISTRATION_DUE_HOURS");
  return new Date(checkIn.getTime()+dueHours*3600000).toISOString();
}
