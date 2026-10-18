import type {GuestSession} from '../../api/guest-email';
export function expireMatchingGuestSession(current:GuestSession|null,request:Extract<GuestSession,{authenticated:true}>):GuestSession|null{
 return current?.authenticated&&current.profile.userId===request.profile.userId&&current.csrf===request.csrf
  ?{authenticated:false}:current;
}
