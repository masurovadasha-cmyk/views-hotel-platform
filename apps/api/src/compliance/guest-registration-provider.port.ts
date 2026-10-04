export type DecryptedGuestDocument={
  documentType:string;
  documentNumber:string;
  issuingCountryCode:string|null;
  expiresOn:string|null;
};

export type GuestRegistrationSubmission={
  caseId:string;
  reservationId:string;
  propertyId:string;
  checkInAt:string;
  checkOutAt:string;
  guest:{
    firstName:string;
    lastName:string;
    dateOfBirth:string;
    nationalityCountryCode:string;
    residencyCountryCode:string|null;
  };
  document:DecryptedGuestDocument;
};

export type GuestRegistrationSubmissionResult={
  status:"submitted"|"confirmed";
  externalRegistrationId:string;
  confirmationObjectKey?:string;
  responseMetadata?:Record<string,unknown>;
};

export interface GuestRegistrationProviderPort{
  readonly provider:string;
  submit(input:GuestRegistrationSubmission):Promise<GuestRegistrationSubmissionResult>;
}
