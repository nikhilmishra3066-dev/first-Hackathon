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
  }, [session, path]);

  if (path.startsWith("/track")) return <LiveTracking />;
  if (path.startsWith("/live-demo")) return <LiveDemo />;
  if (!session) return <Login />;
  if (path.startsWith("/account")) return <Account />;
  return <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
