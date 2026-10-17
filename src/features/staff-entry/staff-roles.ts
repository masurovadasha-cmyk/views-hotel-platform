import type {HospitalityRole} from '../../domain/types';
export const staffRoles=['front_desk','housekeeper','technician','concierge','accountant','manager','owner','procurement','warehouse'] as const;
export type StaffRole=typeof staffRoles[number];
export type StaffSection='reception'|'booking'|'housekeeping'|'inventory'|'folios'|'refunds'|'supplies';
export const roleInfo:Record<StaffRole,{title:string;description:string;tasks:string[];demoRole:HospitalityRole|null;sections:StaffSection[]}>= {
 front_desk:{title:'Reception',description:'Welcome guests and manage each stay.',tasks:['Arrivals and departures','Bookings and guest invitations','Guest folios'],demoRole:'front_desk',sections:['reception','booking','folios']},
 housekeeper:{title:'Housekeeping',description:'Your assigned apartments and cleaning tasks.',tasks:['Assigned cleaning tasks','Cleaning checklists','Readiness and inspection'],demoRole:'cleaner',sections:['housekeeping']},
 technician:{title:'Maintenance',description:'Repairs and equipment care.',tasks:['Assigned repair requests','Fault details','Completion evidence'],demoRole:'technician',sections:[]},
 concierge:{title:'Concierge',description:'Guest requests and services in one place.',tasks:['Guest requests','Transfers and services','Communication with guests'],demoRole:'concierge',sections:[]},
 accountant:{title:'Accounting',description:'Operational charges and financial reconciliation.',tasks:['Guest folios','Refund reconciliation','Night audit'],demoRole:'accountant',sections:['folios','refunds']},
 manager:{title:'Management',description:'Coordinate property operations and the team.',tasks:['Property operations','Apartments and availability','Guest folios'],demoRole:'general_manager',sections:['reception','booking','inventory','folios','refunds']},
 owner:{title:'Owner workspace',description:'Your properties and financial oversight.',tasks:['Apartments and availability','Guest folios','Refund reconciliation'],demoRole:'owner_readonly',sections:['inventory','folios','refunds']},
 procurement:{title:'Purchasing',description:'Purchases, suppliers and deliveries for your properties.',tasks:['Purchase requests','Supplier orders','Delivery tracking'],demoRole:null,sections:['supplies']},
 warehouse:{title:'Warehouse',description:'Receive, store and issue property supplies.',tasks:['Goods receipts','Stock balances','Issues and inventory counts'],demoRole:null,sections:['supplies']}
};
export function parseStaffRole(value:unknown):StaffRole|null{return typeof value==='string'&&staffRoles.includes(value as StaffRole)?value as StaffRole:null;}
/** Navigation preference only. Authentication and permissions come from Core. */
export function requestedStaffRole(search=globalThis.location?.search||''):StaffRole|null{return parseStaffRole(new URLSearchParams(search).get('staffRole'));}
export function staffEntryUrl(role:StaffRole,local:boolean,pathname=globalThis.location?.pathname||'/'){
 const query=new URLSearchParams({api:local?'local-core':'demo',entry:'staff',staffRole:role});return pathname+'?'+query;
}
export function staffRoleMatches(requested:StaffRole|null,actual:string){return requested===null||requested===actual;}
export function staffSections(role:string,permissions:readonly string[]):StaffSection[]{
 const parsed=parseStaffRole(role);if(!parsed)return [];
 const required:Record<StaffSection,string>={reception:'reservation.manage',booking:'reservation.manage',housekeeping:'housekeeping.work',inventory:'property.manage',folios:'reservation.read',refunds:'finance.read',supplies:'supply.read'};
 return roleInfo[parsed].sections.filter(section=>permissions.includes(required[section]));
}
