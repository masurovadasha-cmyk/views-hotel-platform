export const UZBEKISTAN_COMPLIANCE={
  countryCode:"UZ",
  accommodationRegistrationProviderCode:"emehmon"
} as const;

export function isGuestFeeEligible(age:number,minAge:number){
  if(!Number.isInteger(age)||age<0||age>130)throw new Error("INVALID_GUEST_AGE");
  if(!Number.isInteger(minAge)||minAge<0||minAge>130)throw new Error("INVALID_FEE_MIN_AGE");
  return age>=minAge;
}

export function residencyScope(isResident:boolean):"resident"|"nonresident"{
  return isResident?"resident":"nonresident";
}

export function defaultProductDocumentStorageRegion(countryCode:string){
  // Product security default only. This is not a statement of legal minimum.
  return countryCode==="UZ"?"UZ":"jurisdiction-default";
}

export function registrationDueAt(checkInAt:string,dueHours:number){
  const checkIn=new Date(checkInAt);
  if(!Number.isFinite(checkIn.getTime()))throw new Error("INVALID_CHECK_IN");
  if(!Number.isInteger(dueHours)||dueHours<1||dueHours>240)throw new Error("INVALID_REGISTRATION_DUE_HOURS");
  return new Date(checkIn.getTime()+dueHours*3600000).toISOString();
}
