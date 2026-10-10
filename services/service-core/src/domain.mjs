export const priceWithMarkup=(cost,percent=25)=>{if(!Number.isSafeInteger(cost)||cost<0||!Number.isFinite(percent)||percent<0)throw Error("Invalid price");return Math.round(cost*(100+percent)/100)};
export function allocateFefo(lots,quantity,asOf="2026-10-09"){
 if(!Number.isSafeInteger(quantity)||quantity<=0)throw Error("Invalid quantity");
 let left=quantity;const allocation=[];
 for(const lot of [...lots].filter(x=>!x.blocked&&(!x.expiresAt||x.expiresAt>asOf)).sort((a,b)=>(a.expiresAt||"9999-12-31").localeCompare(b.expiresAt||"9999-12-31"))){
  const available=lot.onHand-lot.reserved;
  if(!Number.isSafeInteger(available)||available<0)throw Error("Invalid lot");
  const take=Math.min(left,available);
  if(take>0)allocation.push({lotId:lot.id,quantity:take});
  left-=take;if(left===0)break;
 }
 if(left)throw Error("Insufficient inventory");
 return allocation;
}
export const canTransition=(from,to)=>({
 draft:["awaiting_payment","cancelled"],awaiting_payment:["confirmed","cancelled"],confirmed:["assigned","cancelled"],assigned:["in_progress","cancelled"],in_progress:["completed","cancelled"],completed:[],cancelled:[]
}[from]||[]).includes(to);
