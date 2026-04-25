import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { bootPlumixGlobals } from "./lib/plumix-globals.js";

import "./styles/globals.css";

// Plugin chunks load after this script and call window.plumix.* at
// module-eval time, so the global has to exist before they execute.
bootPlumixGlobals();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
