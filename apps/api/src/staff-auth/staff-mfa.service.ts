import {randomBytes} from 'node:crypto';
import {BadRequestException,Injectable,NotFoundException} from '@nestjs/common';
import {generateAuthenticationOptions,generateRegistrationOptions,verifyAuthenticationResponse,verifyRegistrationResponse,
 type AuthenticationResponseJSON,type RegistrationResponseJSON} from '@simplewebauthn/server';
import {decodeAttestationObject} from '@simplewebauthn/server/helpers';
import {DatabaseService} from '../database/database.service';
import {StaffAuthService,staffTokenHash} from './staff-auth.service';

const ORIGIN='http://localhost:4173',RP_ID='localhost';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
type Ceremony='register'|'authenticate'|'replace';
type State={registered:boolean;verifiedUntil:string|null;recoveryCodesRemaining:number};
export function recoveryCodeDigest(org:string,member:string,code:unknown){
 if(typeof code!=='string'||code.length>64)throw new BadRequestException('STAFF_PASSKEY_INVALID');
 const normalized=code.trim().toLowerCase().replaceAll('-','');
 if(!/^[a-f0-9]{32}$/.test(normalized))throw new BadRequestException('STAFF_PASSKEY_INVALID');
 return staffTokenHash('staff-recovery:v1:'+org+':'+member+':'+normalized);
}
type Challenge={id:string;credentialId:string|null;challengeHash:string;publicKey:string;counter:number;membershipId:string};
/** Local passkey rehearsal only: does not grant privileged roles or enable login bypass. */
@Injectable()
export class StaffMfaService{
 constructor(private readonly db:DatabaseService,private readonly auth:StaffAuthService){}
 scope(){
  const org=this.auth.scope();
  if(process.env.VIEWS_STAFF_PASSKEY_PILOT_ENABLED!=='true')throw new NotFoundException('STAFF_PASSKEY_NOT_ACTIVATED');
  return org;
 }
 private async call<T>(token:string,operation:string,input:unknown):Promise<T>{
  const org=this.scope();await this.auth.resolve(token);
  const r=(await this.db.query<{value:T|null}>('SELECT app.staff_mfa($1,$2,$3,$4) AS value',[org,staffTokenHash(token),operation,input])).rows[0]?.value;
  if(!r)throw new BadRequestException('STAFF_PASSKEY_INVALID');return r;
 }
 async state(token:string){return {enabled:true,...await this.call<State>(token,'state',{})};}
 async recoveryCodes(token:string,password:unknown){
  this.scope();const identity=await this.auth.reauthenticate(token,password);
  const recoveryCodes=Array.from({length:8},()=>randomBytes(16).toString('hex').match(/.{4}/g)!.join('-'));
  await this.call(token,'recovery_codes',{hashes:recoveryCodes.map(code=>recoveryCodeDigest(identity.organizationId,identity.membershipId,code))});
  return {recoveryCodes};
 }
 async begin(token:string,purpose:Ceremony,password:unknown,recoveryCode:unknown=null){
  this.scope();const identity=purpose!=='authenticate'?await this.auth.reauthenticate(token,password):await this.auth.resolve(token);
  const recoveryHash=purpose==='replace'&&recoveryCode!==null?recoveryCodeDigest(identity.organizationId,identity.membershipId,recoveryCode):null;
  const options=purpose!=='authenticate'?await generateRegistrationOptions({rpName:'VIEWS local pilot',rpID:RP_ID,userName:identity.email,
   userID:new TextEncoder().encode(identity.membershipId),attestationType:'none',supportedAlgorithmIDs:[-7,-257],timeout:120000,
   authenticatorSelection:{residentKey:'required',userVerification:'required'}}):await generateAuthenticationOptions({rpID:RP_ID,userVerification:'required',timeout:120000});
  const q=await this.call<Challenge>(token,'begin',{purpose,challengeHash:staffTokenHash(options.challenge),recoveryHash});
  if(purpose==='replace'&&q.credentialId)Object.assign(options,{excludeCredentials:[{id:q.credentialId,type:'public-key'}]});
  if(purpose==='authenticate'&&q.credentialId)Object.assign(options,{allowCredentials:[{id:q.credentialId,type:'public-key'}]});
  return {challengeId:q.id,options};
 }
 async finish(token:string,purpose:Ceremony,challengeId:unknown,response:unknown){
  this.scope();
  if(typeof challengeId!=='string'||!UUID.test(challengeId)||!response||typeof response!=='object'||JSON.stringify(response).length>16000)
   throw new BadRequestException('STAFF_PASSKEY_INVALID');
  const q=await this.call<Challenge>(token,'claim',{purpose,challengeId});
  try{
   const client=(response as RegistrationResponseJSON).response?.clientDataJSON;
   const data=JSON.parse(Buffer.from(client,'base64url').toString('utf8'));
   if(data.crossOrigin===true||data.topOrigin!==undefined)throw Error('CROSS_ORIGIN');
   const expectedChallenge=(challenge:string)=>staffTokenHash(challenge)===q.challengeHash;
   let proof:Record<string,unknown>;
   if(purpose!=='authenticate'){
    const r=response as RegistrationResponseJSON;
    // Reject attestation paths that could consult external certificate/metadata services.
    if(decodeAttestationObject(Buffer.from(r.response.attestationObject,'base64url')).get('fmt')!=='none')throw Error('ATTESTATION_NOT_NONE');
    const result=await verifyRegistrationResponse({response:r,expectedChallenge,expectedOrigin:ORIGIN,expectedRPID:RP_ID,
     requireUserVerification:true,requireUserPresence:true,supportedAlgorithmIDs:[-7,-257]});
    if(!result.verified)throw Error('NOT_VERIFIED');
    const credential=result.registrationInfo.credential;
    if(r.id!==credential.id||r.rawId!==credential.id)throw Error('CREDENTIAL_MISMATCH');
    proof={credentialId:credential.id,publicKey:Buffer.from(credential.publicKey).toString('base64'),counter:credential.counter};
   }else{
    if(!q.credentialId)throw Error('NO_CREDENTIAL');
    const r=response as AuthenticationResponseJSON;
    if(r.id!==q.credentialId||r.rawId!==q.credentialId||
      (r.response.userHandle&&r.response.userHandle!==Buffer.from(q.membershipId).toString('base64url')))throw Error('CREDENTIAL_MISMATCH');
    const result=await verifyAuthenticationResponse({response:response as AuthenticationResponseJSON,expectedChallenge,expectedOrigin:ORIGIN,
     expectedRPID:RP_ID,requireUserVerification:true,credential:{id:q.credentialId,publicKey:Buffer.from(q.publicKey,'base64'),counter:q.counter}});
    if(!result.verified)throw Error('NOT_VERIFIED');
    proof={credentialId:q.credentialId,counter:result.authenticationInfo.newCounter,previousCounter:q.counter};
   }
   return await this.call<{ok:true;loginRequired?:boolean}>(token,'finish',{purpose,challengeId,...proof});
  }catch{throw new BadRequestException('STAFF_PASSKEY_INVALID');}
 }
}
