import type {HospitalityRole} from '../../domain/types';
// UI demonstration policy only; not authentication or a backend permission grant.
export function demoMarketAccess(role:HospitalityRole):'operate'|'read'|'none'{
 if(['general_manager','super_admin','front_desk','concierge'].includes(role))return 'operate';
 return role==='owner_readonly'?'read':'none';
}
