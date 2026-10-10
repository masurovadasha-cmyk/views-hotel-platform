export type GuestEmailLink={challengeId:string;token:string};
export type GuestEmailLinkState={link:GuestEmailLink|null;invalid:boolean};
/** Called once before React renders (including StrictMode). Never persist the fragment. */
export function consumeGuestEmailLink(href:string,replace:(url:string)=>void):GuestEmailLinkState{
 const url=new URL(href),p=new URLSearchParams(url.hash.slice(1));
 if(!p.has('challengeId')&&!p.get('token')?.startsWith('vgel_'))return {link:null,invalid:false};
 url.hash='';replace(url.pathname+url.search);
 const challengeId=p.get('challengeId')||'',token=p.get('token')||'';
 const valid=Array.from(p).length===2&&p.getAll('challengeId').length===1&&p.getAll('token').length===1
  &&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(challengeId)
  &&/^vgel_[A-Za-z0-9_-]{43}$/.test(token);
 return valid?{link:{challengeId,token},invalid:false}:{link:null,invalid:true};
}
