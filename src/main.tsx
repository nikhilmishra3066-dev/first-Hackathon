import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import Account from "./pages/Account";
import LiveDemo from "./pages/LiveDemo";
import Login from "./pages/Login";
import LiveTracking from "./pages/LiveTracking";
import { replace, usePath } from "./router";
import { useSession } from "./lib/auth";
import "./globals.css";

function Router() {
  const path = usePath();
  const session = useSession();

  useEffect(() => {
    if (session && path === "/login") replace("/");
    // Only account-specific pages need a signed-in session; the public site stays open.
    if (!session && path.startsWith("/account")) replace("/login");
  }, [session, path]);

  if (path.startsWith("/track")) return <LiveTracking />;
  if (path.startsWith("/live-demo")) return <LiveDemo />;
  if (path.startsWith("/account")) return session ? <Account /> : <Login />;
  if (path === "/login") return <Login />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
