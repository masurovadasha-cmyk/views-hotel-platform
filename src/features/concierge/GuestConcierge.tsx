import {useEffect,useState} from 'react';
import {GuestPreferences} from './GuestPreferences';
import {guestEmailRequest} from '../../api/guest-email';
import {useGuestLocale} from '../guest/GuestLocale';
import {ConciergeWorkspace} from './ConciergeWorkspace';
export function GuestConcierge({reservationId,csrf,online,onExpired,onPending,canRequest}:{reservationId:string;csrf:string;online:boolean;onExpired:()=>void;onPending:(v:boolean)=>void;canRequest:boolean}){
 const [conversationPending,setConversationPending]=useState(false),[preferencesPending,setPreferencesPending]=useState(false);
 useEffect(()=>onPending(conversationPending||preferencesPending),[conversationPending,preferencesPending,onPending]);
 const {locale}=useGuestLocale(),route='services/concierge';
 return <><ConciergeWorkspace locale={locale} staff={false} online={online} canRequest={canRequest} reservationId={reservationId} route={route} onPending={setConversationPending} onExpired={onExpired}
 load={cursor=>guestEmailRequest(route+'?reservationId='+reservationId+(cursor?'&cursor='+cursor:''))} send={a=>guestEmailRequest(a.route,a.body,csrf,a.key)}/><GuestPreferences reservationId={reservationId} csrf={csrf} locale={locale} online={online} canRequest={canRequest} onPending={setPreferencesPending} onExpired={onExpired}/></>;
}
