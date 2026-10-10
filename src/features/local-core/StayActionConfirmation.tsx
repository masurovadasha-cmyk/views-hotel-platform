import {useStaffLocale} from './StaffLocale';
import {useEffect,useRef} from 'react';
import type {TurnoverRow} from './TurnoverPanel';
export type StayAction='check-in'|'check-out'|'cleaning-complete';
export function StayActionConfirmation({row,action,busy,onConfirm,onCancel,fallbackFocus,trigger}:{row:TurnoverRow;action:StayAction;busy:boolean;onConfirm:()=>void;onCancel:()=>void;fallbackFocus:()=>void;trigger:HTMLElement|null}){
 const {t}=useStaffLocale();
 const dialog=useRef<HTMLDivElement>(null),confirm=useRef<HTMLButtonElement>(null);
 const returnFocus=useRef(fallbackFocus);returnFocus.current=fallbackFocus;
 useEffect(()=>{
  const previous=trigger;
  confirm.current?.focus();
  return()=>{if(previous?.isConnected)previous.focus();else returnFocus.current();};
 },[]);
 useEffect(()=>{if(busy)dialog.current?.focus();},[busy]);
 const title=action==='cleaning-complete'?'Подтвердить готовность номера':action==='check-in'?'Оформить тестовое заселение':'Оформить тестовый выезд';
 return <div className="stayConfirmationBackdrop">
  <div ref={dialog} tabIndex={-1} className="localPanel stayConfirmation" role="alertdialog" aria-modal="true" aria-labelledby="stay-action-title" aria-describedby="stay-action-description" onKeyDown={event=>{
   if(event.key==='Escape'){event.preventDefault();if(!busy)onCancel();}
   if(event.key==='Tab'){
    const buttons=[...dialog.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if(!buttons.length){event.preventDefault();dialog.current?.focus();return;}
    const first=buttons[0],last=buttons[buttons.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
   }
  }}>
   <h3 id="stay-action-title">{t(title)}</h3>
   <p id="stay-action-description">{row.unitCode?t('Номер {unit}',{unit:row.unitCode}):t("Номер не назначен")} {' '}{t("· бронь")}{' '}{row.confirmationCode}.
    {action==='cleaning-complete'?t(" После подтверждения номер станет доступен для следующего тестового заселения."):t(" Реальная оплата и государственная регистрация гостя не выполняются.")}</p>
   <button ref={confirm} type="button" disabled={busy} onClick={onConfirm}>{t("Подтвердить действие")}</button>
   <button type="button" disabled={busy} onClick={onCancel}>{t("Отмена")}</button>
   {busy&&<p role="status">{t("Ожидаем подтверждение сервера…")}</p>}
  </div>
 </div>;
}
