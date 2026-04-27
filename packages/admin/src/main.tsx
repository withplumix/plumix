import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { bootPlumixGlobals } from "./lib/plumix-globals.js";
import { waitForPluginChunks } from "./lib/wait-for-plugin-chunks.js";

import "./styles/globals.css";

// Plugin chunks load after this script and call window.plumix.* at
// module-eval time, so the global has to exist before they execute.
bootPlumixGlobals();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

// Defer the initial mount until every `<script data-plumix-plugin>` tag
// has finished evaluating. Otherwise a deep-link to a plugin route
// (e.g. /_plumix/admin/pages/media) renders before the plugin's
// registerPluginPage() side effect runs, and the route falls through
// to "Plugin not loaded" with no re-render to recover.
void waitForPluginChunks().then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
