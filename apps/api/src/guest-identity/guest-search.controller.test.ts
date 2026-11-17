import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GuestSearchController} from './guest-search.controller';
import {DatabaseService} from '../database/database.service';
import {GuestIdentityService} from './guest-identity.service';
const query=vi.fn(),session=vi.fn();
const controller=new GuestSearchController({query} as unknown as DatabaseService,{session} as unknown as GuestIdentityService);
const input={from:'2037-10-01',to:'2037-10-02',guests:'2',city:'Tashkent'};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_GUEST_QUOTES_PILOT_ENABLED','true');session.mockResolvedValue({});query.mockResolvedValue({rows:[{result:{items:[],requiresQuote:true,priceKind:'base_nightly_excludes_charges'}}]});});
afterEach(()=>vi.unstubAllEnvs());
it('rejects unknown fields, invalid dates and capacity before querying',async()=>{
 for(const q of [{...input,organizationId:'forged'},{...input,to:input.from},{...input,guests:'0'},{...input,guests:'2.0'},{...input,city:[]}])await expect(controller.search('Bearer token',q)).rejects.toThrow();
 expect(query).not.toHaveBeenCalled();
});
it('requires authentication and local gates',async()=>{
 session.mockRejectedValue(new Error('GUEST_SESSION_INVALID'));await expect(controller.search(undefined,input)).rejects.toThrow('GUEST_SESSION_INVALID');
 vi.stubEnv('NODE_ENV','production');await expect(controller.search('Bearer token',input)).rejects.toThrow('GUEST_SEARCH_DISABLED');expect(query).not.toHaveBeenCalled();
});
it('bounds results and never accepts a staff actor',async()=>{
 query.mockResolvedValue({rows:[{result:{items:Array.from({length:51},(_,id)=>({id})),requiresQuote:true}}]});
 const result=await controller.search('Bearer token',input);expect(result.items).toHaveLength(50);expect(result.truncated).toBe(true);
 expect(query.mock.calls[0][1]).toEqual([expect.stringMatching(/^[a-f0-9]{64}$/),input.from,input.to,2,input.city]);
});
