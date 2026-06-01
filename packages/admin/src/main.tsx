import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App.js";
import { bootI18n } from "./lib/i18n-boot.js";
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

// Catalog load can't gate the mount — a network blip on `de.mjs` would
// otherwise leave the admin permanently blank. Fall through to the
// source-locale fallback (Lingui renders descriptor `message` when no
// catalog is active) and surface the failure to the console.
const i18nReady = bootI18n().catch((error: unknown) => {
  console.error("plumix i18n boot failed; rendering with source locale", error);
});

void Promise.all([waitForPluginChunks(), i18nReady]).then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
