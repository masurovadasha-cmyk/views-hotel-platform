export type ServiceCatalogItem={
  id:string;label:string;sla:string;owner:string;chargeable:boolean;
  statusFlow:string[];guestInputs:string[];
};

export const serviceCatalog:ServiceCatalogItem[]=[
  {id:"concierge",label:"Concierge",sla:"15 min",owner:"Head Concierge",chargeable:true,statusFlow:["requested","in_progress","completed"],guestInputs:["request details","preferences","preferred time"]},
  {id:"cleaning",label:"Cleaning",sla:"On schedule",owner:"Housekeeping Supervisor",chargeable:false,statusFlow:["requested","in_progress","inspection","completed"],guestInputs:["room","time window","notes"]},
  {id:"maintenance",label:"Maintenance",sla:"30 min acknowledgement",owner:"Chief Engineer",chargeable:true,statusFlow:["requested","in_progress","resolved","verified"],guestInputs:["issue type","location","photos"]},
  {id:"laundry",label:"Laundry",sla:"Same day",owner:"Laundry Manager",chargeable:true,statusFlow:["requested","collected","in_progress","on_the_way","delivered"],guestInputs:["items","care notes","pickup time"]},
  {id:"restaurant",label:"Restaurant",sla:"20 min",owner:"F&B Manager",chargeable:true,statusFlow:["requested","confirmed","in_progress","served"],guestInputs:["party size","order details","dietary needs","preferred time"]},
  {id:"bar",label:"Bar",sla:"20 min",owner:"F&B Manager",chargeable:true,statusFlow:["requested","in_progress","ready","delivered"],guestInputs:["items","delivery option","preferred time"]},
  {id:"minimart",label:"V Market",sla:"30 min",owner:"Operations",chargeable:true,statusFlow:["requested","in_progress","out_for_delivery","delivered"],guestInputs:["items","quantity","delivery time"]},
  {id:"rent_car",label:"Rent Car",sla:"45 min",owner:"Transport Coordinator",chargeable:true,statusFlow:["requested","assigned","confirmed","completed"],guestInputs:["vehicle class","pickup","destination","passengers"]},
  {id:"spa",label:"Spa & Wellness",sla:"On schedule",owner:"Spa Manager",chargeable:true,statusFlow:["requested","confirmed","in_progress","completed"],guestInputs:["treatment","therapist preference","preferred time"]}
];

export const operationalExceptions=["lost_found","damage_report","inventory_low","sla_breach","dnd","service_declined"] as const;
