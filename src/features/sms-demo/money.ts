/** Exact two-decimal display for the demo's UZS/USD/EUR currencies. */
export function demoMoney(minor:string,currency:string){
 if(!/^(0|[1-9][0-9]*)$/.test(minor)||!['UZS','USD','EUR'].includes(currency))return null;
 const value=BigInt(minor);return `${(value/100n).toLocaleString('ru-RU')},${String(value%100n).padStart(2,'0')} ${currency}`;
}
