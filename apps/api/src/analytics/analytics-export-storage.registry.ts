import {Injectable} from "@nestjs/common";
import type {AnalyticsExportStoragePort} from "./analytics-export-storage.port";

@Injectable()
export class AnalyticsExportStorageRegistry{
  private readonly providers=new Map<string,AnalyticsExportStoragePort>();

  register(provider:AnalyticsExportStoragePort){
    const code=provider.provider.trim();
    if(!code)throw new Error("INVALID_ANALYTICS_EXPORT_STORAGE_PROVIDER");
    if(this.providers.has(code))throw new Error("ANALYTICS_EXPORT_STORAGE_ALREADY_REGISTERED");
    this.providers.set(code,provider);
  }

  get(provider?:string|null){
    if(provider){
      const selected=this.providers.get(provider);
      if(!selected)throw new Error("ANALYTICS_EXPORT_STORAGE_NOT_CONNECTED");
      return selected;
    }

    const connected=[...this.providers.values()];
    if(connected.length!==1)throw new Error("ANALYTICS_EXPORT_STORAGE_NOT_CONNECTED");
    return connected[0];
  }

  connected(){
    return [...this.providers.keys()].sort();
  }
}
