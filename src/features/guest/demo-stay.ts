import {stayNights} from '../../domain/bookingQuote';
import {propertyDay} from '../calendar/model';

// A saved demo search preference only, never a reservation or connected guest record.
export const demoStayKey='views.demo-stay.v1';
export type DemoStay=[string,string];
type StayStorage=Pick<Storage,'getItem'|'setItem'>;
export function parseDemoStay(raw:string|null,now=new Date()):DemoStay{
 if(raw===null)return ['',''];
 try{
  const value:unknown=JSON.parse(raw);
  if(!Array.isArray(value)||value.length!==2||!value.every(v=>typeof v==='string'))return ['',''];
  const [start,end]=value as DemoStay;
  if(start===''&&end==='')return ['',''];
  return stayNights(start,end)>0&&start>=propertyDay(now)?[start,end]:['',''];
 }catch{return ['',''];}
}
export function loadDemoStay(storage:StayStorage,now=new Date()):DemoStay{
 try{return parseDemoStay(storage.getItem(demoStayKey),now);}catch{return ['',''];}
}
export function saveDemoStay(storage:StayStorage,value:DemoStay,now=new Date()){
 const checked=parseDemoStay(JSON.stringify(value),now);
 // Invalid/partial drafts cannot overwrite the last saved selection.
 if(checked[0]!==value[0]||checked[1]!==value[1])return;
 try{storage.setItem(demoStayKey,JSON.stringify(checked));}catch{/* Calendar selection still works without browser storage. */}
}
