import {translate} from '../../i18n/messages';
import {useStaffLocale} from './StaffLocale';
import type {StaffLocale} from './staff-locale';
import catalog from './folio-workspace-translations.json';
export const folioWorkspaceTitle=(locale:StaffLocale)=>translate(catalog,locale,'Folios and night audit');
export function useFolioLocale(){const {locale}=useStaffLocale();return {locale,t:(source:string)=>translate(catalog,locale,source)};}
export function folioError(error:unknown){
 const code=error instanceof Error?error.message:'';
 if(code==='FOLIO_DISABLED')return 'Folios are not connected on this server.';
 if(['PROPERTY_FORBIDDEN','STAFF_PERMISSION_DENIED','FOLIO_NOT_FOUND'].includes(code))return 'The record is unavailable or your access has changed. Reload the list.';
 if(code==='FOLIO_NOT_OPEN')return 'This folio is closed. Reload it before continuing.';
 if(code==='FOLIO_REVERSAL_NOT_ALLOWED')return 'This entry cannot be reversed here. Reload the folio and review its history.';
 if(code==='FOLIO_ALREADY_REVERSED')return 'This charge was already reversed. Reload the folio.';
 if(code==='FOLIO_AMOUNT_INVALID')return 'Enter a positive amount with no more than two decimal places.';
 if(code==='FOLIO_INPUT_INVALID')return 'Check the date, amount and description.';
 if(code==='FOLIO_COMMAND_CONFLICT')return 'The command conflicts with an existing operation. Reload the record and check its history.';
 if(code==='NIGHT_AUDIT_DATE_NOT_CLOSED')return 'Choose a completed business date in the property time zone.';
 if(code==='NIGHT_AUDIT_UNRESOLVED_ARRIVALS')return 'Resolve pending arrivals before posting the night audit.';
 if(code==='NIGHT_AUDIT_RECONCILIATION_REQUIRED')return 'The nightly charges need reconciliation. Posting is blocked.';
 if(code==='NIGHT_AUDIT_STALE')return 'The audit preview changed. Review a new preview and confirm again.';
 return 'The server did not confirm the operation. Retry manually with the same request.';
}
export function definitiveFolioError(error:unknown){return error instanceof Error&&['FOLIO_DISABLED','PROPERTY_FORBIDDEN','STAFF_PERMISSION_DENIED','FOLIO_NOT_FOUND','FOLIO_NOT_OPEN','FOLIO_ALREADY_REVERSED','FOLIO_REVERSAL_NOT_ALLOWED','FOLIO_INPUT_INVALID','FOLIO_COMMAND_CONFLICT','NIGHT_AUDIT_DATE_NOT_CLOSED','NIGHT_AUDIT_UNRESOLVED_ARRIVALS','NIGHT_AUDIT_RECONCILIATION_REQUIRED','NIGHT_AUDIT_STALE'].includes(error.message);}
