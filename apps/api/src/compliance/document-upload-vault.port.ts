import type {DocumentVaultPort} from "./document-vault.port";

export type CreateDocumentUploadInput={
  documentRecordId:string;
  organizationId:string;
  reservationGuestId:string;
  storageRegion:string;
  contentType:string;
  maxBytes:number;
};

export type CreateDocumentUploadResult={
  objectKey:string;
  storageRegion:string;
  uploadUrl:string;
  expiresAt:string;
  requiredHeaders?:Record<string,string>;
  encryptionKeyRef?:string;
};

export type FinalizeDocumentUploadInput={
  documentRecordId:string;
  objectKey:string;
  storageRegion:string;
};

export type FinalizeDocumentUploadResult={
  objectKey:string;
  checksumSha256:string;
  encryptionKeyRef?:string;
  documentNumberHash?:string;
};

export interface DocumentUploadVaultPort extends DocumentVaultPort{
  createUpload(input:CreateDocumentUploadInput):Promise<CreateDocumentUploadResult>;
  finalizeUpload(input:FinalizeDocumentUploadInput):Promise<FinalizeDocumentUploadResult>;
}

export function supportsDocumentUpload(vault:DocumentVaultPort):vault is DocumentUploadVaultPort{
  const candidate=vault as Partial<DocumentUploadVaultPort>;
  return typeof candidate.createUpload==="function"&&typeof candidate.finalizeUpload==="function";
}
