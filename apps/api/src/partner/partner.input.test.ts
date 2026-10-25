import {describe,it,expect,vi} from 'vitest';
import {offerInput,decisionInput,id} from './partner.input';
import {PartnerService} from './partner.service';
const uuid='10000000-0000-4000-8000-000000000001';
describe('partner input/closed pilot',()=>{
 it('accepts only explicitly scoped synthetic terms',()=>{expect(decisionInput({action:'accept',expectedRevision:1,termsVersion:1})).toEqual({action:'accept',expectedRevision:1,termsVersion:1});for(const b of [{action:'pay',expectedRevision:1,termsVersion:1},{action:'accept',expectedRevision:1,termsVersion:2},{action:'reject',expectedRevision:1,termsVersion:1,staffRole:'owner'}])expect(()=>decisionInput(b)).toThrow('PARTNER_INPUT_INVALID');});
 it('validates all identifiers, revision and explicit timezone',()=>{expect(offerInput({orderId:uuid,grantId:uuid,expectedOrderRevision:1,expiresAt:'2026-10-25T12:00:00Z'}).expiresAt).toBe('2026-10-25T12:00:00.000Z');for(const v of [null,[],{},'../x'])expect(()=>id(v)).toThrow();expect(()=>offerInput({orderId:uuid,grantId:uuid,expectedOrderRevision:0,expiresAt:'tomorrow'})).toThrow();});
 it('does not access DB outside the explicit local test pilot',async()=>{vi.stubEnv('VIEWS_PARTNER_PILOT_ENABLED','false');try{await expect(new PartnerService({} as never).list('a'.repeat(64),{})).rejects.toThrow('PARTNER_PILOT_DISABLED');}finally{vi.unstubAllEnvs();}});
});
