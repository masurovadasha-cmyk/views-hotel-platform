export type FiscalizationSubmission={
  requestId:string;
  receiptType:"sale"|"refund";
  amountMinor:bigint;
  currency:string;
  payload:Record<string,unknown>;
};

export type FiscalizationSubmissionResult={
  status:"submitted"|"confirmed";
  externalReceiptId:string;
  fiscalSign?:string;
  receiptUrl?:string;
  responseMetadata?:Record<string,unknown>;
};

export interface FiscalizationProviderPort{
  readonly provider:string;
  submit(input:FiscalizationSubmission):Promise<FiscalizationSubmissionResult>;
}
