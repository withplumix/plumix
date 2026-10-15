import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { seedAuthContext } from "@plumix/core/auth/client";

import { App } from "./App.js";
import { adminBasePath } from "./lib/admin-base.js";
import { bootI18n } from "./lib/i18n-boot.js";
import { readManifest } from "./lib/manifest.js";
import { bootPlumixGlobals } from "./lib/plumix-globals.js";
import { waitForPluginChunks } from "./lib/wait-for-plugin-chunks.js";

import "./styles/globals.css";

// Plugin chunks evaluate after this script and call `window.plumix.*` at
// module-eval.
bootPlumixGlobals();
// No server render seeds `authClient` here, so the admin hands it its mount.
seedAuthContext({
  basePath: adminBasePath(),
  methods: { methods: [], oauth: [] },
});

const rootElement = document.getElementById("root");
// eslint-disable-next-line no-restricted-syntax -- React boot guard; convention exception per umbrella #232
if (!rootElement) throw new Error("Missing #root element");

/**
 * Can't gate the mount: a network blip on a catalog would leave the admin
 * blank.
 */
const i18nReady = bootI18n({
  lang: document.documentElement.lang,
  pluginI18n: readManifest().pluginI18n,
}).catch((error: unknown) => {
  console.error("plumix i18n boot failed; rendering with source locale", error);
});

void Promise.all([waitForPluginChunks(), i18nReady]).then(() => {
  createRoot(rootElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
