import type {Locale} from '../../i18n/messages';
import {formatStaffMoney} from '../local-core/staff-locale';
export function marketMoney(minor:string,currency:string,locale:Locale){return formatStaffMoney(minor,locale).replace(/UZS$/,currency);}
