import {useGuestLocale} from '../guest/GuestLocale';
import {FormEvent,useState} from "react";
import {api} from "../../api/client";

export function AuthPanel({onDone}:{onDone:()=>void}){
  const {t}=useGuestLocale();
  const [email,setEmail]=useState("");
  const [token,setToken]=useState("");
  const [stage,setStage]=useState<"email"|"token">("email");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");

  async function requestLink(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage("");
    try{
      const result=await api.requestLogin(email);
      setStage("token");
      if(result.status==="staging_token_created"&&result.token){
        setToken(result.token);
        setMessage("Staging-only verification token loaded. Production never exposes login tokens.");
      }else{
        setMessage("Login link requested. Use the secure link/token delivered by the configured email provider.");
      }
    }
    catch(error){setMessage("Login request failed. Check your connection and try again.")}
    finally{setBusy(false)}
  }
  async function verify(e:FormEvent){
    e.preventDefault();setBusy(true);setMessage("");
    try{await api.verifyLogin(token);onDone()}
    catch(error){setMessage("Verification failed. Request a new link if the token has expired.")}
    finally{setBusy(false)}
  }

  return <section className="authPanel">
    <div><small>{t("SECURE ACCESS")}</small><h2>{t("Sign in to VIEWS")}</h2><p>{t("Passwordless email access. Staff permissions are resolved server-side after authentication.")}</p></div>
    {stage==="email"?<form onSubmit={requestLink}><label>{t("Email")}<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com"/></label><button className="primary" disabled={busy}>{busy?t("Sending…"):t("Continue with email")}</button></form>
    :<form onSubmit={verify}><label>{t("Verification token")}<input required value={token} onChange={e=>setToken(e.target.value)} placeholder={t("Paste secure token")}/></label><button className="primary" disabled={busy}>{busy?t("Verifying…"):t("Verify & continue")}</button><button type="button" onClick={()=>setStage("email")}>{t("Use another email")}</button></form>}
    {message&&<div className="notice">{t(message)}</div>}
  </section>
}
