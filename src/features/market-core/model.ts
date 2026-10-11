export type MarketProduct={id:string;name:Record<string,string>;priceMinor:string;currency:string;revision:number;availableQuantity:string};
export type MarketLine={serviceId:string;name:Record<string,string>;quantity:number;priceMinor:string};
export type MarketOrder={orderId:string;stage:string;revision:number;currency:string;totalMinor:string;lines:MarketLine[];requestedFor:string;replacesOrderId?:string|null;replacedByOrderId?:string|null;issue?:{status:string;note:string;answer?:string}|null;unitCode?:string};
export type CartLine={product:MarketProduct;quantity:number};
export function cartTotal(lines:CartLine[]){return lines.reduce((sum,l)=>sum+BigInt(l.product.priceMinor)*BigInt(l.quantity),0n).toString();}
export function validCart(lines:CartLine[]){return lines.length>0&&lines.length<=20&&new Set(lines.map(l=>l.product.id)).size===lines.length&&new Set(lines.map(l=>l.product.currency)).size===1&&lines.every(l=>Number.isInteger(l.quantity)&&l.quantity>=1&&l.quantity<=50&&BigInt(l.quantity)<=BigInt(l.product.availableQuantity))&&BigInt(cartTotal(lines))<=9223372036854775807n;}

// The server revalidates both stock and the selected order revision at commit.
export function replacementProduct(product:MarketProduct,order:MarketOrder|null):MarketProduct{
 const held=order?.stage==='reserved'?order.lines.find(l=>l.serviceId===product.id)?.quantity??0:0;
 return {...product,availableQuantity:(BigInt(product.availableQuantity)+BigInt(held)).toString()};
}
