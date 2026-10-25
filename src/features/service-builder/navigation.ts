// Only the mounted local draft registers here. No authorization or catalog state.
const guards=new Set<()=>boolean>();
export function registerDraftNavigationGuard(guard:()=>boolean){guards.add(guard);return()=>{guards.delete(guard);};}
export function allowDraftNavigation(){for(const guard of guards)if(!guard())return false;return true;}
