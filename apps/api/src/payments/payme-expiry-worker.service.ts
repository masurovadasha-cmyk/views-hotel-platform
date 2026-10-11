import {Injectable} from "@nestjs/common";
import {DatabaseService} from "../database/database.service";
import {PaymeMerchantApiService,PAYME_TIMEOUT_MS} from "./payme-merchant-api.service";
import {loadPaymeSandboxConfig} from "./payme-sandbox.config";

export type PaymeExpiryReport={
  schemaVersion:1;mode:"sandbox";enabled:boolean;
  candidates:number;expired:number;unchanged:number;busy:number;conflicts:number;
  failed:number;budgetExhausted:boolean;hasMore:boolean;elapsedMs:number;
};

/** One bounded maintenance cycle; no timer, HTTP route or provider RPC is added.
 * Each expiration is an independent atomic transaction. Errors are counted with
 * no raw SQL, merchant credentials, payment identifiers or request bodies. */
@Injectable()
export class PaymeExpiryWorkerService{
  constructor(private readonly db:DatabaseService,private readonly merchant:PaymeMerchantApiService){}

  async runCycle(limit=50,budgetMs=10000):Promise<PaymeExpiryReport>{
    if(!Number.isInteger(limit)||limit<1||limit>100)throw new Error("PAYME_EXPIRY_LIMIT_INVALID");
    if(!Number.isInteger(budgetMs)||budgetMs<100||budgetMs>30000)throw new Error("PAYME_EXPIRY_BUDGET_INVALID");
    const started=Date.now();
    const config=loadPaymeSandboxConfig();
    const report:PaymeExpiryReport={schemaVersion:1,mode:"sandbox",enabled:!!config,candidates:0,
      expired:0,unchanged:0,busy:0,conflicts:0,failed:0,budgetExhausted:false,hasMore:false,elapsedMs:0};
    if(!config)return report;
    const org=config.organizationId.toLowerCase();
    const candidates=await this.db.withOrganization(org,async client=>{
      await client.query("SET LOCAL statement_timeout='3s'");
      return (await client.query<{payme_transaction_id:string}>(
        `SELECT payme_transaction_id FROM payme_merchant_transactions
         WHERE organization_id=$1 AND state=1 AND payme_time_ms<=$2
         ORDER BY payme_time_ms,id LIMIT $3`,[org,started-PAYME_TIMEOUT_MS,limit+1]
      )).rows;
    });
    report.hasMore=candidates.length>limit;
    for(const candidate of candidates.slice(0,limit)){
      if(Date.now()-started>=budgetMs){report.budgetExhausted=true;report.hasMore=true;break;}
      report.candidates++;
      try{
        const outcome=await this.db.withOrganization(org,async client=>{
          await client.query("SET LOCAL lock_timeout='250ms'");
          await client.query("SET LOCAL statement_timeout='3s'");
          return this.merchant.expirePendingTransaction(client,org,candidate.payme_transaction_id);
        });
        if(outcome==="conflict")report.conflicts++;
        else report[outcome]++;
      }catch(error){
        const code=(error as {code?:string})?.code;
        if(["55P03","57014","40P01"].includes(code||""))report.busy++;
        else report.failed++;
      }
    }
    report.hasMore=report.hasMore||report.busy>0||report.failed>0||report.conflicts>0;
    report.elapsedMs=Date.now()-started;
    return report;
  }
}
