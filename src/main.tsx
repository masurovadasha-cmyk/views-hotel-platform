import {CanvaWorkbench} from './features/canva-workbench/CanvaWorkbench';
import {SmsPaymentDemo} from './features/sms-demo/SmsPaymentDemo';
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./design-system/foundation.css";
import "./design-system/core-surfaces.css";
import {consumeGuestEmailLink} from "./features/guest-auth/guest-email-link";

const guestLink=consumeGuestEmailLink(location.href,url=>history.replaceState(null,"",url));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{new URLSearchParams(location.search).get('entry')==='canva-workbench'?<CanvaWorkbench/>:import.meta.env.VITE_RELEASE_REVIEW!=='true'&&location.hostname==='127.0.0.1'&&new URLSearchParams(location.search).get('entry')==='sms-demo'?<SmsPaymentDemo/>:<App guestLink={guestLink}/>}</React.StrictMode>
);
