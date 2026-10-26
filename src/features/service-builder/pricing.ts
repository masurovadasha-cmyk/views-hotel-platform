// Unpublished arithmetic only. Never an operational quote or approved price.
export const maxMinor='9223372036854775807';
export type PriceRule={kind:'unit';currency:'UZS';unitMinor:string};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function validatePricing(value:unknown):PriceRule|null{
 if(value===null)return null;
 if(!object(value)||Object.keys(value).sort().join()!=='currency,kind,unitMinor'||value.kind!=='unit'||value.currency!=='UZS'||typeof value.unitMinor!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(value.unitMinor)||BigInt(value.unitMinor)>BigInt(maxMinor))throw Error('invalid');
 return {kind:'unit',currency:'UZS',unitMinor:value.unitMinor};
}
export function simulatePricing(rule:unknown,quantity:unknown){
 const price=validatePricing(rule);
 // Same bounded sample quantity and signed-bigint total ceiling as market-core/model.ts.
 if(!price||typeof quantity!=='string'||!/^([1-9]|[1-4][0-9]|50)$/.test(quantity))throw Error('invalid');
 const total=BigInt(price.unitMinor)*BigInt(quantity);
 if(total>BigInt(maxMinor))throw Error('limit');
 return {simulationOnly:true as const,approved:false as const,currency:'UZS' as const,unitMinor:price.unitMinor,quantity:Number(quantity),totalMinor:total.toString()};
}
