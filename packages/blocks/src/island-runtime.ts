// Client-side runtime entry for the islands MVP. The Vite islands
// plugin (`plugin-islands.ts`) registers this as a script tag in the
// document head; on first execution it registers the custom element
// and every supported strategy. Subsequent executions (e.g. HMR) are
// idempotent — both registration functions guard against
// double-registration. Theme code never imports this; the framework
// emits the script tag from SSR.

import { registerIslandElement, setRendererUrl } from "./island-element.js";
import { registerIdleStrategy } from "./island-strategies/idle.js";
import { registerInteractionStrategy } from "./island-strategies/interaction.js";
import { registerLoadStrategy } from "./island-strategies/load.js";
import { registerOnlyStrategy } from "./island-strategies/only.js";
import { registerVisibleStrategy } from "./island-strategies/visible.js";

export function bootstrapIslandRuntime(): void {
  registerLoadStrategy();
  registerIdleStrategy();
  registerVisibleStrategy();
  registerInteractionStrategy();
  registerOnlyStrategy();
  // Thread the renderer chunk URL (carried on the SSR-injected bootstrap
  // `<script>`, resolved from Vite's manifest) in BEFORE defining the
  // custom element. `customElements.define` synchronously upgrades any
  // `<plumix-island>` already in the SSR'd DOM, and an eager strategy
  // (`load`) hydrates right there in `connectedCallback` — `loadRenderer()`
  // would otherwise run before the URL is set and reject with "island
  // renderer URL not set".
  const url = readRendererUrl();
  if (url) setRendererUrl(url);
  registerIslandElement();
}

function readRendererUrl(): string | null {
  const script = document.querySelector<HTMLScriptElement>(
    "script[data-plumix-renderer-url]",
  );
  return script?.dataset.plumixRendererUrl ?? null;
}

bootstrapIslandRuntime();
