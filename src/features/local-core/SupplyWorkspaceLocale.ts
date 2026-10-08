import {translate} from '../../i18n/messages';
import {useStaffLocale} from './StaffLocale';
import catalog from './supply-translations.json';
export function useSupplyLocale(){const {locale}=useStaffLocale();return {locale,t:(source:string)=>translate(catalog,locale,source)};}
export function supplyError(error:unknown){
 const code=error instanceof Error?error.message:'';
 if(code==='SUPPLY_DISABLED')return 'Supply operations are not connected on this server.';
 if(['PROPERTY_FORBIDDEN','STAFF_PERMISSION_DENIED','SUPPLY_NOT_FOUND'].includes(code))return 'This record is unavailable or your access has changed. Reload the workspace.';
 if(code==='SUPPLY_INPUT_INVALID'||code==='SUPPLY_QUANTITY_INVALID')return 'Check the item, reference and positive whole quantity. Fractions are not supported.';
 if(code==='SUPPLY_ORDER_EMPTY')return 'The order has no valid lines. Contact the responsible employee before receipt.';
 if(code==='ORDER_ALREADY_RECEIVED')return 'This order was already received. Reload orders and stock.';
 if(code==='INSUFFICIENT_STOCK')return 'Not enough stock. Reload stock and check the quantity.';
 if(code==='STOCK_LIMIT_EXCEEDED')return 'The quantity exceeds the supported stock limit.';
 if(code==='SUPPLY_COMMAND_CONFLICT')return 'The command conflicts with an existing operation. Check the history before a new operation.';
 return 'The server did not confirm the result. Retry the same request manually. Do not create a new operation.';
}
export function supplyDefinitive(error:unknown){return error instanceof Error&&['SUPPLY_DISABLED','PROPERTY_FORBIDDEN','STAFF_PERMISSION_DENIED','SUPPLY_NOT_FOUND','SUPPLY_INPUT_INVALID','ORDER_ALREADY_RECEIVED','INSUFFICIENT_STOCK','STOCK_LIMIT_EXCEEDED','SUPPLY_COMMAND_CONFLICT','SUPPLY_ORDER_EMPTY'].includes(error.message);}
