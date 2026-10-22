import registry from '../../../docs/design/canva-140-delivery.json';
export const designScreens=registry.screens;
export const designRoles=['guest','dispatcher','staff','partner','host','admin'] as const;
export function selectDesignScreens(query:string,role:string,status:string){const term=query.trim().toLocaleLowerCase();return designScreens.filter(s=>(!role||s.area===role)&&(!status||s.implementation===status)&&(!term||[s.id,s.title,s.role].some(v=>v.toLocaleLowerCase().includes(term))));}
export function designAsset(id:string,dark:boolean){if(!designScreens.some(s=>s.id===id))throw Error('UNKNOWN_DESIGN_SCREEN');return `${import.meta.env.BASE_URL}design-140/${id}-${dark?'dark':'light'}.webp`;}
