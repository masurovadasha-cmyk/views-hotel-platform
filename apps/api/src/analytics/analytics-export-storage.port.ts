export type AnalyticsExportPutInput={
  objectKey:string;
  contentType:"text/csv; charset=utf-8";
  body:Uint8Array;
  checksumSha256:string;
};

export type AnalyticsExportPutResult={
  objectKey:string;
  etag?:string;
};

export type AnalyticsExportDownloadInput={
  objectKey:string;
  expiresInSeconds:number;
};

export type AnalyticsExportDownloadResult={
  url:string;
  expiresAt:string;
};

export interface AnalyticsExportStoragePort{
  readonly provider:string;
  putObject(input:AnalyticsExportPutInput):Promise<AnalyticsExportPutResult>;
  createDownloadUrl(
    input:AnalyticsExportDownloadInput
  ):Promise<AnalyticsExportDownloadResult>;
}
