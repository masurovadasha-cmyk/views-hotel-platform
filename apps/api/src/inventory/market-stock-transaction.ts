import type {PoolClient} from "pg";

/**
 * Low-level transaction primitive for the V-Market server.
 * Caller MUST open a database transaction, establish authenticated actor context
 * and validate property scope before calling. No public controller is exposed.
 */
export async function reserveMarketStock(
  client:Pick<PoolClient,"query">,
  input:{organizationId:string;propertyId:string;orderId:string;lines:{sku:string;quantity:number}[]}
):Promise<void>{
  if(!input.lines.length||input.lines.length>100)throw Error("INVALID_MARKET_LINES");
  const normalized=[...input.lines].sort((a,b)=>a.sku.localeCompare(b.sku,"en"));
  if(new Set(normalized.map(x=>x.sku)).size!==normalized.length)throw Error("DUPLICATE_SKU");
  for(const line of normalized){
    if(!line.sku||line.sku.length>80||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>10000)throw Error("INVALID_MARKET_QUANTITY");
  }
  // All rows are locked in a deterministic order to avoid deadlocks.
  for(const line of normalized){
    const result=await client.query<{id:string;on_hand:number;reserved:number}>(
      `SELECT id,on_hand,reserved FROM market_stock_balances
        WHERE organization_id=$1 AND property_id=$2 AND sku=$3 FOR UPDATE`,
      [input.organizationId,input.propertyId,line.sku]
    );
    const balance=result.rows[0];
    if(!balance||balance.on_hand-balance.reserved<line.quantity)throw Error("MARKET_OUT_OF_STOCK");
    const updated=await client.query(
      `UPDATE market_stock_balances
          SET reserved=reserved+$1,version=version+1,updated_at=now()
        WHERE id=$2 AND organization_id=$3 AND property_id=$4
          AND on_hand-reserved >= $1`,
      [line.quantity,balance.id,input.organizationId,input.propertyId]
    );
    if(updated.rowCount!==1)throw Error("MARKET_STOCK_CONFLICT");
    await client.query(
      `INSERT INTO market_stock_movements(
         organization_id,stock_balance_id,order_id,movement_type,quantity_delta,reservation_delta,reason)
       VALUES($1,$2,$3,'reserve',0,$4,'checkout reservation')`,
      [input.organizationId,balance.id,input.orderId,line.quantity]
    );
  }
}
