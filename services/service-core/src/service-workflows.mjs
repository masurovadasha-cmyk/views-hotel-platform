const laundryTransitions=Object.freeze({
 registered:["collected","cancelled"],
 collected:["processing","cancelled"],
 processing:["ready"],
 ready:["returned"],
 returned:[],
 cancelled:[]
});
export function canMoveLaundry(from,to){return laundryTransitions[from]?.includes(to)===true}
export function validateChecklist(items){
 if(!Array.isArray(items)||items.length<1||items.length>100)throw Error("Invalid checklist");
 const codes=new Set();
 for(const item of items){
  if(!item||typeof item.code!=="string"||!/^[-a-z0-9_]{1,64}$/.test(item.code)||typeof item.label!=="string"||item.label.trim().length<2||item.label.length>200)throw Error("Invalid checklist item");
  if(codes.has(item.code))throw Error("Duplicate checklist item");
  codes.add(item.code);
 }
 return true;
}
export function canCompleteCleaning(items){
 return Array.isArray(items)&&items.length>0&&items.every(item=>item.completedAt&&item.completedBy);
}
