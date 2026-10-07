import type { Apartment, ServiceOrder } from "../domain/types";

export const apartments:Apartment[]=[
{id:"modern",title:"Views | Modern Design Apartment | Views",property:"NRG U-Tower",city:"Tashkent",capacity:2,bedrooms:1,bathrooms:1,nightlyRate:null,currency:"USD",amenities:["Kitchen","Wi-Fi","Free parking","Pets","Smart TV"],image:new URL("../assets/demo/modern.jpg",import.meta.url).href},
{id:"panoramic",title:"Views | Luxury Apartment with Panoramic | Views",property:"NRG U-Tower",city:"Tashkent",capacity:4,bedrooms:1,bathrooms:1,nightlyRate:null,currency:"USD",amenities:["Kitchen","Wi-Fi","Workspace","Free parking","Balcony"],image:new URL("../assets/demo/panoramic.jpg",import.meta.url).href},
{id:"garden",title:"Views | Urban Garden Apartment with Balcony | Views",property:"NRG U-Tower",city:"Tashkent",capacity:4,bedrooms:1,bathrooms:1,nightlyRate:null,currency:"USD",amenities:["Kitchen","Wi-Fi","Free parking","Pets","Balcony"],image:new URL("../assets/demo/garden.jpg",import.meta.url).href},
{id:"peach",title:"Views | Peach & Cream Luxury Apartment | Views",property:"NRG U-Tower",city:"Tashkent",capacity:3,bedrooms:1,bathrooms:1,nightlyRate:null,currency:"USD",amenities:["Kitchen","Wi-Fi","Free parking","Pets","Smart TV"],image:new URL("../assets/demo/peach.jpg",import.meta.url).href}
];

export const initialOrders:ServiceOrder[]=[
{id:"SO-1001",title:"Pre-arrival concierge",category:"concierge",status:"new",priority:"normal",assigneeUserId:null,unit:"235",guestName:"Demo Guest",slaMinutes:120,history:["created"]},
{id:"SO-1002",title:"Turnover cleaning",category:"cleaning",status:"assigned",priority:"high",assigneeUserId:"u-cleaner",unit:"250",guestName:null,slaMinutes:45,history:["created","assigned"]},
{id:"SO-1003",title:"Air conditioner inspection",category:"maintenance",status:"assigned",priority:"normal",assigneeUserId:"u-tech",unit:"49",guestName:null,slaMinutes:180,history:["created","assigned"]}
];
