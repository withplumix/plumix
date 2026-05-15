import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { bootPlumixGlobals } from "./lib/plumix-globals.js";
import { waitForPluginChunks } from "./lib/wait-for-plugin-chunks.js";

import "./styles/globals.css";

// Plugin chunks evaluate after this script and call `window.plumix.*`
// at module-eval time. Boot the global first so it exists when they
// run, then defer the initial mount until every chunk has settled —
// see `waitForPluginChunks` for why.
bootPlumixGlobals();

const rootElement = document.getElementById("root");
// eslint-disable-next-line no-restricted-syntax -- React boot guard; convention exception per umbrella #232
if (!rootElement) throw new Error("Missing #root element");

void waitForPluginChunks().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
