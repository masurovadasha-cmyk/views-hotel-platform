import type {PoolClient} from "pg";

export type MarketTerminalAction="delivered"|"cancelled";

/**
 * Low-level market terminal stock mutation.
 * MUST be called in the SAME transaction as a version-checked order status
 * transition, with authenticated tenant/property context and the order row locked.
 * No public route or permission to mutate RLS tables is granted here.
 */
export async function finalizeMarketStock(
 client:Pick<PoolClient,"query">,
 input:{organizationId:string;propertyId:string;orderId:string;action:MarketTerminalAction;lines:{sku:string;quantity:number}[]}
):Promise<void>{
 if(input.action!=="delivered"&&input.action!=="cancelled")throw Error("INVALID_MARKET_ACTION");
 if(!input.lines.length||input.lines.length>100)throw Error("INVALID_MARKET_LINES");
 const lines=[...input.lines].sort((a,b)=>a.sku.localeCompare(b.sku,"en"));
 if(new Set(lines.map(l=>l.sku)).size!==lines.length)throw Error("DUPLICATE_SKU");
 for(const line of lines){
  if(!line.sku||line.sku.length>80||!Number.isSafeInteger(line.quantity)||line.quantity<1||line.quantity>10000)throw Error("INVALID_MARKET_QUANTITY");
 }
 for(const line of lines){
  const locked=await client.query<{id:string;on_hand:number;reserved:number}>(
   `SELECT id,on_hand,reserved FROM market_stock_balances
     WHERE organization_id=$1 AND property_id=$2 AND sku=$3 FOR UPDATE`,
   [input.organizationId,input.propertyId,line.sku]
  );
  const row=locked.rows[0];
  if(!row||row.reserved<line.quantity||(input.action==="delivered"&&row.on_hand<line.quantity))throw Error("MARKET_RESERVATION_CONFLICT");
  const delta=input.action==="delivered"?-line.quantity:0;
  const updated=await client.query(
   `UPDATE market_stock_balances
      SET on_hand=on_hand+$1,reserved=reserved-$2,version=version+1,updated_at=now()
     WHERE id=$3 AND organization_id=$4 AND property_id=$5
       AND reserved >= $2 AND on_hand+$1 >= reserved-$2`,
   [delta,line.quantity,row.id,input.organizationId,input.propertyId]
  );
  if(updated.rowCount!==1)throw Error("MARKET_STOCK_CONFLICT");
  await client.query(
   `INSERT INTO market_stock_movements(
      organization_id,stock_balance_id,order_id,movement_type,quantity_delta,reservation_delta,reason)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,
   [input.organizationId,row.id,input.orderId,input.action==="delivered"?"sale":"release",delta,-line.quantity,input.action==="delivered"?"order delivered":"order cancelled"]
  );
 }
}
