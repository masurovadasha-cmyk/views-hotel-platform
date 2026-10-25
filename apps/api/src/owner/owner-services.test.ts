import {describe,it,expect,vi} from 'vitest';
import {ownerServicesInput,OwnerServicesService} from './owner-services.service';
const property='10000000-0000-4000-8000-000000000002';
describe('owner services boundary',()=>{
 it('bounds and validates keysets and rejects unknown fields',()=>{
  expect(ownerServicesInput(property,{kind:'orders'})).toEqual({propertyId:property,kind:'orders',after:null,limit:20});
  for(const q of [{kind:'history'},{kind:'orders',limit:'51'},{kind:'orders',limit:2},{kind:'orders',after:'bad'},{kind:'orders',userId:property}])expect(()=>ownerServicesInput(property,q)).toThrow('OWNER_SERVICES_INPUT_INVALID');
 });
 it('requires an actual session before using the database',async()=>{
  vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_OWNER_SERVICES_ENABLED','true');
  try{const db={withActor:vi.fn()},s=new OwnerServicesService(db as never);await expect(s.list({} as never,'',property,{kind:'orders'})).rejects.toThrow('STAFF_SESSION_REQUIRED');expect(db.withActor).not.toHaveBeenCalled();}finally{vi.unstubAllEnvs();}
 });
 it('fails closed outside the local test pilot',async()=>{
  vi.stubEnv('VIEWS_OWNER_SERVICES_ENABLED','false');try{await expect(new OwnerServicesService({} as never).list({} as never,'',property,{kind:'orders'})).rejects.toThrow('OWNER_SERVICES_DISABLED');}finally{vi.unstubAllEnvs();}
 });
});
