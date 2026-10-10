import {useEffect,useRef,type ReactNode} from 'react';
import {useLegacyStaffLocale} from './LegacyStaffLocale';
import {StaffLanguageSelector} from '../local-core/StaffLocale';

export function StaffDialog({children,onClose}:{children:ReactNode;onClose:()=>void}) {
  const {t}=useLegacyStaffLocale();
  const dialog=useRef<HTMLDialogElement>(null);
  const close=useRef(onClose); close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
    const element=dialog.current;
    element?.showModal();
    return ()=>{element?.close();if(previous?.isConnected)previous.focus();};
  },[]);
  return <dialog ref={dialog} className="staffMobileSheet" data-testid="staff-order-drawer" aria-modal="true" aria-label={t('Staff workspace panel')} onKeyDown={event=>{
    if(event.key!=='Tab')return;
    const items=Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')).filter(item=>item.getClientRects().length>0);
    const first=items[0],last=items[items.length-1];
    if(!first){event.preventDefault();return;}
    if(event.shiftKey&&(document.activeElement===first||!event.currentTarget.contains(document.activeElement))){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||!event.currentTarget.contains(document.activeElement))){event.preventDefault();first.focus();}
  }} onCancel={event=>{event.preventDefault();close.current();}}>
    <div className="staffDialogToolbar"><StaffLanguageSelector/><button className="staffSheetClose" onClick={onClose} aria-label={t('Close')}>{t('Close')}</button></div>{children}
  </dialog>;
}
