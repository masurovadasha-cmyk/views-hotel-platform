import { useState } from "react";
import type { HospitalityRole } from "./domain/types";
import { GuestApp } from "./features/guest/GuestApp";
import { StaffApp } from "./features/staff/StaffApp";

export function App(){
  const [mode,setMode]=useState<"guest"|"staff">("guest");
  const [role,setRole]=useState<HospitalityRole>("general_manager");
  const [dark,setDark]=useState(false);

  return <div className={dark?"app dark":"app"}>
    <header className="brandbar">
      <div className="brand"><span className="vmark">V</span><div><strong>VIEWS</strong><small>HOTEL & APARTMENTS</small></div><i/><p>One Ecosystem<br/>A Better Experience</p></div>
      <div className="cities">TASHKENT · SAMARKAND · BUKHARA · KHIVA · AND BEYOND</div>
      <div className="topActions">
        <button onClick={()=>setDark(v=>!v)}>{dark?"Light":"Dark"}</button>
        <button onClick={()=>setMode(mode==="guest"?"staff":"guest")}>{mode==="guest"?"Staff CRM":"Guest App"}</button>
      </div>
    </header>
    {mode==="guest"?<GuestApp/>:<StaffApp role={role} onRoleChange={setRole}/>}
  </div>;
}
