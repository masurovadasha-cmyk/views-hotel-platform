import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";
import "./design-system/foundation.css";
import {consumeGuestEmailLink} from "./features/guest-auth/guest-email-link";

const guestLink=consumeGuestEmailLink(location.href,url=>history.replaceState(null,"",url));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App guestLink={guestLink} /></React.StrictMode>
);
