export type OwnerPayoutSubmission={
  payoutInstructionId:string;
  economicsSnapshotId:string;
  reservationId:string;
  amountMinor:bigint;
  currency:string;
  destinationRef:string;
  idempotencyKey:string;
};

export type OwnerPayoutSubmissionResult={
  externalPayoutId:string;
  status:"submitted"|"confirmed";
};

export type OwnerPayoutStatusResult={
  externalPayoutId:string;
  status:"submitted"|"confirmed"|"failed";
};

export interface OwnerPayoutProviderPort{
  readonly provider:string;
  submit(input:OwnerPayoutSubmission):Promise<OwnerPayoutSubmissionResult>;
  getStatus(input:{
    payoutInstructionId:string;
    externalPayoutId:string;
  }):Promise<OwnerPayoutStatusResult>;
}
