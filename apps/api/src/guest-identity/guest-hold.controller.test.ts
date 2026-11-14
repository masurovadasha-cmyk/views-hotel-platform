import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {GuestHoldController} from './guest-hold.controller';
import {GuestHoldService} from './guest-hold.service';
import {DatabaseService} from '../database/database.service';
import {GuestIdentityService} from './guest-identity.service';
const quote='10000000-0000-4000-8000-000000000001',key='20000000-0000-4000-8000-000000000001';
const query=vi.fn(),session=vi.fn(),service=new GuestHoldService({query} as unknown as DatabaseService,{session} as unknown as GuestIdentityService),controller=new GuestHoldController(service);
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('NODE_ENV','test');vi.stubEnv('VIEWS_LOCAL_REHEARSAL','true');vi.stubEnv('VIEWS_GUEST_HOLDS_PILOT_ENABLED','true');session.mockResolvedValue({userId:quote});query.mockResolvedValue({rows:[{result:{reservationId:quote,totalMinor:'9007199254740993',status:'hold'}}]});});
afterEach(()=>vi.unstubAllEnvs());
it('requires exact body and bearer before invoking any database mutation',()=>{
 for(const body of [null,[],{}, {quoteId:quote,ttl:900},{quoteId:quote,actor:{}},{quoteId:quote,userId:key}])expect(()=>controller.create('Bearer token',key,body)).toThrow('GUEST_HOLD_INPUT_INVALID');
 expect(()=>controller.create(undefined,key,{quoteId:quote})).toThrow('GUEST_SESSION_INVALID');expect(query).not.toHaveBeenCalled();
});
it('validates UUIDs and fixes the demo hold duration on the server',async()=>{
 await expect(controller.create('Bearer token','bad',{quoteId:quote})).rejects.toThrow('GUEST_HOLD_INPUT_INVALID');expect(query).not.toHaveBeenCalled();
 expect(await controller.create('Bearer token',key,{quoteId:quote})).toMatchObject({totalMinor:'9007199254740993'});
 expect(query).toHaveBeenCalledWith('SELECT app.create_guest_hold($1,$2,$3,$4) result',[expect.stringMatching(/^[a-f0-9]{64}$/),quote,key,600]);
});
it('does not mutate when disabled or session resolution fails',async()=>{
 for(const [name,value] of [['NODE_ENV','production'],['VIEWS_LOCAL_REHEARSAL','false'],['VIEWS_GUEST_HOLDS_PILOT_ENABLED','false']]){
  const previous=process.env[name];vi.stubEnv(name,value);await expect(service.create('token',quote,key)).rejects.toThrow('GUEST_HOLDS_DISABLED');vi.stubEnv(name,previous);
 }
 session.mockRejectedValue(new Error('GUEST_SESSION_INVALID'));await expect(service.create('token',quote,key)).rejects.toThrow('GUEST_SESSION_INVALID');expect(query).not.toHaveBeenCalled();
});
it('maps only known SQL errors without exposing database details',async()=>{
 for(const [code,status] of [['28000',401],['P0002',404],['23505',409],['23P01',409],['22023',409]] as const){
  query.mockRejectedValue({code,message:'PRIVATE_SQL_DETAIL'});
  await expect(service.create('token',quote,key)).rejects.toMatchObject({status});
  await expect(service.create('token',quote,key)).rejects.not.toThrow('PRIVATE_SQL_DETAIL');
 }
});
