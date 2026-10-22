import {invalid,object,uuid,revision,note,requestedTime} from './service-order.input';
export function conciergeRequest(raw:unknown){
 const b=object(raw,['reservationId','category','partySize','budgetMinor','requestedFor','message']);
 if(!['restaurant','documents','help'].includes(b.category as string)||!Number.isInteger(b.partySize)||(b.partySize as number)<1||(b.partySize as number)>50||typeof b.budgetMinor!=='string'||!/^(0|[1-9][0-9]{0,18})$/.test(b.budgetMinor)||BigInt(b.budgetMinor)>9223372036854775807n)invalid();
 return {...b,reservationId:uuid(b.reservationId),requestedFor:requestedTime(b.requestedFor),message:note(b.message)};
}
export function conciergeAction(raw:unknown,staff:boolean){
 if(!raw||typeof raw!=='object'||!('action' in raw)||!(staff?['claim','release','message','answer']:['message','close','cancel']).includes(raw.action as string))return invalid();
 const hasMessage=['message','answer'].includes(raw.action as string),b=object(raw,hasMessage?['action','expectedRevision','message']:['action','expectedRevision']);
 return {action:b.action,expectedRevision:revision(b.expectedRevision),...(hasMessage?{message:note(b.message)}:{})};
}
