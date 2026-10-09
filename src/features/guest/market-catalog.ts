// Illustrative assortment only. IDs are not warehouse SKUs; no availability or price is asserted.
export type MarketCategory='Drinks'|'Breakfast'|'Snacks'|'Essentials';
export type MarketProduct={id:string;name:string;category:MarketCategory;size:string};
export const marketProducts:readonly MarketProduct[]=[
 {id:'sample-water',name:'Still water',category:'Drinks',size:'1 L'},
 {id:'sample-tea',name:'Green tea',category:'Drinks',size:'20 bags'},
 {id:'sample-coffee',name:'Ground coffee',category:'Breakfast',size:'250 g'},
 {id:'sample-oats',name:'Oat flakes',category:'Breakfast',size:'500 g'},
 {id:'sample-fruit',name:'Seasonal fruit',category:'Snacks',size:'1 kg'},
 {id:'sample-nuts',name:'Mixed nuts',category:'Snacks',size:'200 g'},
 {id:'sample-toothbrush',name:'Toothbrush',category:'Essentials',size:'1 piece'},
 {id:'sample-tissues',name:'Paper tissues',category:'Essentials',size:'1 pack'}
];
export const marketCategories:readonly MarketCategory[]=['Drinks','Breakfast','Snacks','Essentials'];
export type MarketCart=Readonly<Record<string,number>>;
export function setMarketQuantity(cart:MarketCart,id:string,quantity:number):MarketCart{
 if(!marketProducts.some(product=>product.id===id)||!Number.isInteger(quantity)||quantity<0||quantity>20)return cart;
 const next={...cart};if(quantity===0)delete next[id];else next[id]=quantity;return next;
}
export function marketCartLines(cart:MarketCart){
 return marketProducts.flatMap(product=>{const quantity=cart[product.id];return Number.isInteger(quantity)&&quantity>0&&quantity<=20?[{product,quantity}]:[];});
}
