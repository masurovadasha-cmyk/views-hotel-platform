export type StaffLoad={userId:string;role:string;active:number;completedToday:number;available:boolean;skills:string[]};
export function workloadScore(x:StaffLoad){return x.available?x.active*3-x.completedToday:9999}
export function pickAssignee(staff:StaffLoad[],role:string,requiredSkill?:string){
  return staff.filter(x=>x.role===role&&x.available&&(!requiredSkill||x.skills.includes(requiredSkill))).sort((a,b)=>workloadScore(a)-workloadScore(b))[0]??null;
}
