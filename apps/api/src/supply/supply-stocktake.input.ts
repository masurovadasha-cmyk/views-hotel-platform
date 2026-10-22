import {exact,id,invalid,text,expiryDate} from './supply.input';
function nonnegative(value:unknown){if(typeof value!=='string'||!/^(0|[1-9]\d{0,18})$/.test(value)||BigInt(value)>9223372036854775807n)return invalid();return value;}
function optionalLots(raw:unknown){return !!raw&&typeof raw==='object'&&'lots' in raw;}
function lots(raw:unknown,total:string){
 if(!Array.isArray(raw)||!raw.length||raw.length>20)return invalid();
 const rows=raw.map(value=>{const l=exact(value,['lotCode','expiresOn','quantity']);if(l.lotCode===null&&l.expiresOn===null)return {lotCode:null,expiresOn:null,quantity:nonnegative(l.quantity)};return {lotCode:text(l.lotCode,80),expiresOn:expiryDate(l.expiresOn),quantity:nonnegative(l.quantity)};});
 if(rows.reduce((sum,l)=>sum+BigInt(l.quantity),0n)!==BigInt(total)||new Set(rows.map(l=>JSON.stringify([l.lotCode,l.expiresOn]))).size!==rows.length)return invalid();return rows;
}
export function stocktakePreview(raw:unknown){const has=optionalLots(raw),b=exact(raw,['propertyId','itemId','countedQuantity','reason',...(has?['lots']:[])]),countedQuantity=nonnegative(b.countedQuantity);return {propertyId:id(b.propertyId),itemId:id(b.itemId),countedQuantity,reason:text(b.reason,160),...(has?{lots:lots(b.lots,countedQuantity)}:{})};}
export function stocktakeConfirm(raw:unknown){const has=optionalLots(raw),b=exact(raw,['propertyId','itemId','countedQuantity','reason','expectedQuantity','expectedRevision',...(has?['lots']:[])]);if(has&&b.countedQuantity!==b.expectedQuantity)return invalid();return {...stocktakePreview({propertyId:b.propertyId,itemId:b.itemId,countedQuantity:b.countedQuantity,reason:b.reason,...(has?{lots:b.lots}:{})}),expectedQuantity:nonnegative(b.expectedQuantity),expectedRevision:nonnegative(b.expectedRevision)};}
