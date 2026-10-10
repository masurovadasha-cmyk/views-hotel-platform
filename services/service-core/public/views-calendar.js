const iso=d=>[d.getUTCFullYear(),String(d.getUTCMonth()+1).padStart(2,"0"),String(d.getUTCDate()).padStart(2,"0")].join("-");
const parse=s=>new Date(s+"T00:00:00Z");
const months=new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"});
const label=new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short",timeZone:"UTC"});
export const nights=(start,end)=>start&&end?Math.round((parse(end)-parse(start))/86400000):0;
export function mountViewsCalendar(root,{onSave=()=>{},initialStart=null,initialEnd=null,blocked=[]}={}){
 if(!root)throw Error("calendar element required");
 const forbidden=new Set(blocked);
 let start=initialStart,end=initialEnd;
 const overlay=document.createElement("div");overlay.className="vw-calendar";overlay.hidden=true;
 const header=document.createElement("div");header.className="vw-cal-header";
 const close=document.createElement("button");close.type="button";close.textContent="×";close.setAttribute("aria-label","Закрыть календарь");
 const reset=document.createElement("button");reset.type="button";reset.textContent="Сбросить даты";
 const summary=document.createElement("div");summary.className="vw-cal-summary";summary.setAttribute("aria-live","polite");
 const scroll=document.createElement("div");scroll.className="vw-cal-months";
 const footer=document.createElement("div");footer.className="vw-cal-footer";
 const save=document.createElement("button");save.type="button";save.textContent="Сохранить";
 header.append(close,reset);footer.append(save);overlay.append(header,summary,scroll,footer);root.append(overlay);
 const today=new Date();const first=new Date(Date.UTC(today.getFullYear(),today.getMonth(),1));
 function update(){
  summary.textContent=start?(end?nights(start,end)+" ночей · "+label.format(parse(start))+" — "+label.format(parse(end)):"Выберите дату выезда · "+label.format(parse(start))):"Выберите даты заезда и выезда";
  scroll.querySelectorAll("[data-date]").forEach(button=>{
   const day=button.dataset.date;
   const selected=day===start||day===end;
   button.classList.toggle("vw-cal-edge",selected);
   button.classList.toggle("vw-cal-between",!!(start&&end&&day>start&&day<end));
   button.setAttribute("aria-pressed",String(selected));
  });
  save.disabled=!start||!end;
 }
 function choose(day){
  if(forbidden.has(day))return;
  if(!start||end||day<=start){start=day;end=null}
  else if([...forbidden].some(blockedDay=>blockedDay>start&&blockedDay<day)){start=day;end=null}
  else end=day;
  update();
 }
 for(let m=0;m<15;m++){
  const month=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+m,1));
  const title=document.createElement("h3");title.textContent=months.format(month);
  const grid=document.createElement("div");grid.className="vw-cal-grid";
  for(const text of ["П","В","С","Ч","П","С","В"]){const el=document.createElement("span");el.className="vw-cal-weekday";el.textContent=text;grid.append(el)}
  const offset=(month.getUTCDay()+6)%7;
  for(let i=0;i<offset;i++){const el=document.createElement("span");el.setAttribute("aria-hidden","true");grid.append(el)}
  const days=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
  for(let i=1;i<=days;i++){
   const day=iso(new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),i)));
   const button=document.createElement("button");button.type="button";button.className="vw-cal-day";
   button.dataset.date=day;button.textContent=String(i);
   button.setAttribute("aria-label",day);
   button.disabled=forbidden.has(day);
   button.onclick=()=>choose(day);grid.append(button);
  }
  const section=document.createElement("section");section.className="vw-cal-month";section.append(title,grid);scroll.append(section);
 }
 function open(){overlay.hidden=false;update();scroll.scrollTop=0;close.focus()}
 function dismiss(){overlay.hidden=true}
 close.onclick=dismiss;
 reset.onclick=()=>{start=null;end=null;update()};
 save.onclick=()=>{if(!start||!end)return;onSave({start,end,nights:nights(start,end)});dismiss()};
 overlay.addEventListener("keydown",e=>{if(e.key==="Escape")dismiss()});
 update();
 return {open,close:dismiss,setRange:(a,b)=>{start=a;end=b;update()},getRange:()=>({start,end})};
}
