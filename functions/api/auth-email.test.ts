import {describe,it,expect,vi} from 'vitest';
import {onRequestPost} from './auth-email';
describe('email delivery readiness',()=>{
 it('does not create login tokens or claim delivery without an actual adapter',async()=>{
  const prepare=vi.fn(),batch=vi.fn();
  for(const VIEWS_ENV of ['production','staging']){
   const response=await onRequestPost({request:new Request('https://views.test/api/auth-email',{method:'POST',headers:{origin:'https://views.test','content-type':'application/json'},body:JSON.stringify({email:'test@example.invalid'})}),env:{VIEWS_ENV,VIEWS_ALLOWED_ORIGINS:'https://views.test',DB:{prepare,batch}}});
   expect(response.status).toBe(503);expect(await response.json()).toMatchObject({error:'EMAIL_DELIVERY_NOT_CONFIGURED'});
  }expect(prepare).not.toHaveBeenCalled();expect(batch).not.toHaveBeenCalled();
 });
});
