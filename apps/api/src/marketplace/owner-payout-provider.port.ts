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

export interface OwnerPayoutProviderPort{
  readonly provider:string;
  submit(input:OwnerPayoutSubmission):Promise<OwnerPayoutSubmissionResult>;
}
