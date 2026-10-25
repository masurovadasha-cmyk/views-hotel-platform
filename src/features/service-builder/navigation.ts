// Only the mounted local draft registers here. No authorization or catalog state.
const guards=new Set<()=>boolean>();
export function registerDraftNavigationGuard(guard:()=>boolean){guards.add(guard);return()=>{guards.delete(guard);};}
export function allowDraftNavigation(){try{for(const guard of guards)if(guard()!==true)return false;return true;}catch{return false;}}
// Read-only callback owned by this app; Android evaluates it without a native JS bridge.
declare global {interface Window {__viewsAllowNativeBack?:()=>boolean}}
if(typeof window!=='undefined')Object.defineProperty(window,'__viewsAllowNativeBack',{value:allowDraftNavigation,writable:false,configurable:false});
