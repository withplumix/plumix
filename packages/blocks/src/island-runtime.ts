// Client-side runtime entry for the islands MVP. The Vite islands
// plugin (`plugin-islands.ts`) registers this as a script tag in the
// document head; on first execution it registers the custom element
// and every supported strategy. Subsequent executions (e.g. HMR) are
// idempotent — both registration functions guard against
// double-registration. Theme code never imports this; the framework
// emits the script tag from SSR.

import { registerIslandElement, setRendererUrl } from "./island-element.js";
import { registerLoadStrategy } from "./island-strategies/load.js";

export function bootstrapIslandRuntime(): void {
  registerLoadStrategy();
  registerIslandElement();
  // The SSR-injected bootstrap `<script>` carries the renderer chunk's
  // URL (resolved from Vite's manifest). Thread it into the element so
  // `hydrate()` can lazily import the React renderer on first hydration.
  const url = readRendererUrl();
  if (url) setRendererUrl(url);
}

function readRendererUrl(): string | null {
  const script = document.querySelector<HTMLScriptElement>(
    "script[data-plumix-renderer-url]",
  );
  return script?.dataset.plumixRendererUrl ?? null;
}

bootstrapIslandRuntime();
