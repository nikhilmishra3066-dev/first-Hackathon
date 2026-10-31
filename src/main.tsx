import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import LiveDemo from "./pages/LiveDemo";
import { usePath } from "./router";
import "./globals.css";

function Router() {
  const path = usePath();
  return path.startsWith("/live-demo") ? <LiveDemo /> : <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Router />
  </StrictMode>,
);
