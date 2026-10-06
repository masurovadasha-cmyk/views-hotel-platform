export type StaffInvitationLink={mode:'activate'|'reset';token:string};
/** Reading a link never consumes it or authenticates an account. Submission of
 * a new password is still a deliberate POST to Core. No storage or telemetry. */
export function readStaffInvitationLink(href:string):StaffInvitationLink|null{
  let url:URL;try{url=new URL(href);}catch{return null;}
  if(url.pathname!=='/'||url.searchParams.get('api')!=='local-core'||url.hash.length>128)return null;
  const parts=new URLSearchParams(url.hash.slice(1));
  if(parts.size!==2||parts.getAll('staff-action').length!==1||parts.getAll('token').length!==1)return null;
  const mode=parts.get('staff-action'),token=parts.get('token');
  if((mode!=='activate'&&mode!=='reset')||!token||!/^[a-f0-9]{64}$/.test(token))return null;
  return {mode,token};
}
export function consumeStaffInvitationLink():StaffInvitationLink|null{
  if(typeof window==='undefined')return null;
  const result=readStaffInvitationLink(window.location.href);
  if(window.location.hash.includes('staff-action=')||window.location.hash.includes('token=')){
    window.history.replaceState(window.history.state,'',window.location.pathname+window.location.search);
  }
  return result;
}
