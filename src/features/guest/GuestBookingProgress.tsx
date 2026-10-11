import {useGuestLocale} from './GuestLocale';
import {guestBookingStep} from './guest-experience';
const steps=['Choose a stay','Select dates','Add guests','Review details','Confirmation'] as const;
export function GuestBookingProgress({screen}:{screen:string}){
 const {t}=useGuestLocale(),current=guestBookingStep(screen);
 return <ol className="guestBookingProgress" data-testid="guest-booking-progress" aria-label={t('Booking steps')}>
  {steps.map((step,index)=><li key={step} className={index===current?'current':index<current?'previous':''} aria-current={index===current?'step':undefined}><span>{String(index+1).padStart(2,'0')}</span><b>{t(step)}</b></li>)}
 </ol>;
}
