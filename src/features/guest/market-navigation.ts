import {translate,type Locale} from '../../i18n/messages';
import messages from './market-translations.json';
export const guestTabs=['explore','bookings','services','messages','profile','market'] as const;
export type GuestTab=typeof guestTabs[number];
export const marketViews=['catalogue','basket','history'] as const;
export type MarketView=typeof marketViews[number];
export type GuestRoute={tab:GuestTab;marketView:MarketView};
export function readGuestRoute(search:string,live=false):GuestRoute{
 const q=new URLSearchParams(search),tab=q.get('guestTab'),view=q.get('marketView');
 return {tab:!live&&guestTabs.includes(tab as GuestTab)?tab as GuestTab:'explore',marketView:marketViews.includes(view as MarketView)?view as MarketView:'catalogue'};
}
export function guestRouteUrl(current:string,route:GuestRoute){
 const url=new URL(current);url.searchParams.set('guestTab',route.tab);
 if(route.tab==='market')url.searchParams.set('marketView',route.marketView);else url.searchParams.delete('marketView');
 // This helper is called only in the existing static guest demo. Preserve any explicit runtime mode.
 if(!url.searchParams.has('api'))url.searchParams.set('api','demo');
 return url;
}
export const marketText=(locale:Locale,key:string)=>translate(messages,locale,key);
