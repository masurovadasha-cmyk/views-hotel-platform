export function createGuestOperationGuard(){
 let owner='',trip=false,link=false,refresh=false;
 return {
  enter(next:string){if(next!==owner){owner=next;trip=false;link=false;refresh=false;}},
  report(scope:string,source:'trip'|'link',pending:boolean){
   if(scope!==owner||(source==='trip'?trip:link)===pending)return false;
   if(source==='trip')trip=pending;else link=pending;return true;
  },
  blocked:()=>trip||link,
  tripPending:()=>trip,
  linkPending:()=>link,
  requestRefresh(scope:string){if(scope!==owner||refresh)return false;refresh=true;return true;},
  takeRefresh(){if(!refresh||trip||link)return false;refresh=false;return true;},
 };
}
