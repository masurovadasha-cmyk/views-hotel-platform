import {useEffect,useRef} from 'react';

/** No SMS provider is configured. Never collect or pretend to verify a code. */
export function SmsUnavailableDialog({onClose}:{onClose:()=>void}){
 const closeButton=useRef<HTMLButtonElement>(null);
 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  closeButton.current?.focus();
  const keydown=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();onClose();}
   if(event.key==='Tab'){event.preventDefault();closeButton.current?.focus();}
  };
  document.addEventListener('keydown',keydown);
  return()=>{document.removeEventListener('keydown',keydown);previous?.focus();};
 },[onClose]);
 return <div className="modalBack" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="phoneModal" role="dialog" aria-modal="true" aria-labelledby="sms-status-title" aria-describedby="sms-status-description">
   <div className="brandMini"><span className="vmark">V</span><b>VIEWS</b></div>
   <h2 id="sms-status-title">SMS verification unavailable</h2>
   <p id="sms-status-description">SMS delivery is not connected. No code has been sent, and phone verification is unavailable.</p>
   <button ref={closeButton} className="primary" onClick={onClose}>Close</button>
  </div>
 </div>;
}
