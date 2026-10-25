import photoSources from '../../assets/market/sources.json';
import teaPhoto from '../../assets/market/tea.webp';
import coffeePhoto from '../../assets/market/coffee.webp';
import oatsPhoto from '../../assets/market/oats.webp';
import fruitPhoto from '../../assets/market/fruit.webp';
import nutsPhoto from '../../assets/market/nuts.webp';
import toothbrushPhoto from '../../assets/market/toothbrush.webp';
import tissuesPhoto from '../../assets/market/tissues.webp';
// Illustrative assortment only. IDs are not warehouse SKUs; no availability or price is asserted.
export type MarketCategory='Drinks'|'Breakfast'|'Snacks'|'Essentials';
const photoFiles:Record<string,string>={'sample-tea':teaPhoto,'sample-coffee':coffeePhoto,'sample-oats':oatsPhoto,'sample-fruit':fruitPhoto,'sample-nuts':nutsPhoto,'sample-toothbrush':toothbrushPhoto,'sample-tissues':tissuesPhoto};
export const marketPhotos=photoSources.map(source=>({...source,src:photoFiles[source.productId]}));
export type MarketPhoto=typeof marketPhotos[number];
export type MarketProduct={id:string;name:string;category:MarketCategory;size:string;photo?:MarketPhoto};
export const marketProducts:readonly MarketProduct[]=[
 {id:'sample-water',name:'Still water',category:'Drinks',size:'1 L'},
 {id:'sample-tea',photo:marketPhotos.find(photo=>photo.productId==='sample-tea'),name:'Green tea',category:'Drinks',size:'20 bags'},
 {id:'sample-coffee',photo:marketPhotos.find(photo=>photo.productId==='sample-coffee'),name:'Ground coffee',category:'Breakfast',size:'250 g'},
 {id:'sample-oats',photo:marketPhotos.find(photo=>photo.productId==='sample-oats'),name:'Oat flakes',category:'Breakfast',size:'500 g'},
 {id:'sample-fruit',photo:marketPhotos.find(photo=>photo.productId==='sample-fruit'),name:'Seasonal fruit',category:'Snacks',size:'1 kg'},
 {id:'sample-nuts',photo:marketPhotos.find(photo=>photo.productId==='sample-nuts'),name:'Mixed nuts',category:'Snacks',size:'200 g'},
 {id:'sample-toothbrush',photo:marketPhotos.find(photo=>photo.productId==='sample-toothbrush'),name:'Toothbrush',category:'Essentials',size:'1 piece'},
 {id:'sample-tissues',photo:marketPhotos.find(photo=>photo.productId==='sample-tissues'),name:'Paper tissues',category:'Essentials',size:'1 pack'}
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
