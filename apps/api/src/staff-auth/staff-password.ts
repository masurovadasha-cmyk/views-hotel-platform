import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';

const N=131072,r=8,p=1,MAXMEM=256*1024*1024;
const FORMAT=/^scrypt-v1\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;
export const DUMMY_PASSWORD_HASH='scrypt-v1$131072$8$1$'+'00'.repeat(16)+'$'+'00'.repeat(64);
const BLOCKED=new Set(['passwordpassword','123456789012345','qwertyuiopasdfgh','password123456789','viewsviewsviews']);
let active=0;
export class StaffPasswordError extends Error{}
export function normalizePassword(raw:unknown):string{
  if(typeof raw!=='string')throw new StaffPasswordError('STAFF_PASSWORD_POLICY');
  const password=raw.normalize('NFC');
  if([...password].length<15||[...password].length>128||Buffer.byteLength(password)>512||/[\x00-\x1f\x7f]/.test(password)
    ||BLOCKED.has(password.toLowerCase())||/^(.)\1+$/u.test(password))throw new StaffPasswordError('STAFF_PASSWORD_POLICY');
  return password;
}
async function derive(password:string,salt:Buffer):Promise<Buffer>{
  if(active>=2)throw new StaffPasswordError('STAFF_AUTH_BUSY');
  active++;
  try{return await new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N,r,p,maxmem:MAXMEM},(error,key)=>error?reject(error):resolve(key)));}
  finally{active--;}
}
export async function hashStaffPassword(raw:unknown){
  const password=normalizePassword(raw),salt=randomBytes(16),key=await derive(password,salt);
  return 'scrypt-v1$131072$8$1$'+salt.toString('hex')+'$'+key.toString('hex');
}
export async function verifyStaffPassword(raw:unknown,encoded:string){
  // Dummy work for an unknown account uses the same scrypt parameters.
  const match=FORMAT.exec(encoded)||FORMAT.exec(DUMMY_PASSWORD_HASH)!;
  const valid=typeof raw==='string'&&[...raw].length<=128&&Buffer.byteLength(raw)<=512;
  const key=await derive(valid?(raw as string).normalize('NFC'):'invalid-password-placeholder',Buffer.from(match[1],'hex'));
  return valid&&FORMAT.test(encoded)&&timingSafeEqual(key,Buffer.from(match[2],'hex'));
}
