import {useEffect,useId,useRef,type ReactNode} from 'react';
import {ChevronLeft} from 'lucide-react';
import {useGuestLocale} from './GuestLocale';

export function GuestDialog({title,onClose,onBack,children}:{title:string;onClose:()=>void;onBack?:()=>void;children:ReactNode}){
 const {t}=useGuestLocale(),titleId=useId();
 const dialog=useRef<HTMLDivElement>(null),heading=useRef<HTMLHeadingElement>(null),close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();close.current();}
   if(event.key==='Tab'){
    const buttons=[...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);
    const first=buttons[0],last=buttons[buttons.length-1];
    if(!first){event.preventDefault();heading.current?.focus();return;}
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===heading.current)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  };
  document.addEventListener('keydown',keydown);
  return()=>{document.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus();};
 },[]);
 useEffect(()=>{heading.current?.focus();},[title]);
 return <div className="modalBack" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
  <div className="modal journeyModal" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialog}>
   <header className={onBack?"journeyHead":"journeyHead noBack"}>{onBack&&<button aria-label={t('Back')} onClick={onBack}><ChevronLeft/></button>}
    <div><small>{t('VIEWS GUEST JOURNEY')}</small><h2 id={titleId} tabIndex={-1} ref={heading}>{title}</h2></div><button onClick={onClose}>{t('Close')}</button>
   </header>{children}
  </div>
 </div>;
}
