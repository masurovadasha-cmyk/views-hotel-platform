import type { Apartment, ServiceOrder } from "../domain/types";

export const apartments:Apartment[]=[
{id:"modern",title:"Views | Modern Design Apartment | Views",property:"NRG U-Tower",city:"Tashkent",capacity:2,bedrooms:1,bathrooms:1,nightlyRate:null,currency:"USD",amenities:["Kitchen","Wi-Fi","Free parking","Pets","Smart TV"],image:"https://a0.muscache.com/im/pictures/hosting/Hosting-1772624665100620734/original/0ec7711f-2923-49dd-b4d1-40af11070247.png?im_w=720"},
{id:"panoramic",title:"Views | Luxury Apartment with Panoramic | Views",property:"NRG U-Tower",city:"Tashkent",capacity:4,bedrooms:1,bathrooms:1,nightlyRate:null,currency:"USD",amenities:["Kitchen","Wi-Fi","Workspace","Free parking","Balcony"],image:"https://a0.muscache.com/im/pictures/hosting/Hosting-1768745438564501646/original/823f2e7c-73af-44e8-b692-67adac0a7f77.jpeg?im_w=720"},
{id:"garden",title:"Views | Urban Garden Apartment with Balcony | Views",property:"NRG U-Tower",city:"Tashkent",capacity:4,bedrooms:1,bathrooms:1,nightlyRate:null,currency:"USD",amenities:["Kitchen","Wi-Fi","Free parking","Pets","Balcony"],image:"https://a0.muscache.com/im/pictures/hosting/Hosting-1771969006287092719/original/d54bac20-165f-455c-882d-1a3a6f9968fb.jpeg?im_w=720"},
{id:"peach",title:"Views | Peach & Cream Luxury Apartment | Views",property:"NRG U-Tower",city:"Tashkent",capacity:3,bedrooms:1,bathrooms:1,nightlyRate:null,currency:"USD",amenities:["Kitchen","Wi-Fi","Free parking","Pets","Smart TV"],image:"https://a0.muscache.com/im/pictures/hosting/Hosting-1769878950462437449/original/ff6d6b99-f33b-42df-8901-a7eb8ca8651d.jpeg?im_w=720"}
];

export const initialOrders:ServiceOrder[]=[
{id:"SO-1001",title:"Pre-arrival concierge",category:"concierge",status:"new",priority:"normal",assigneeUserId:null,unit:"235",guestName:"Demo Guest",slaMinutes:120,history:["created"]},
{id:"SO-1002",title:"Turnover cleaning",category:"cleaning",status:"assigned",priority:"high",assigneeUserId:"u-cleaner",unit:"250",guestName:null,slaMinutes:45,history:["created","assigned"]},
{id:"SO-1003",title:"Air conditioner inspection",category:"maintenance",status:"assigned",priority:"normal",assigneeUserId:"u-tech",unit:"49",guestName:null,slaMinutes:180,history:["created","assigned"]}
];
