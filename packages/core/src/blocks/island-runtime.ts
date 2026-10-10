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
  // Before `define`: it upgrades existing islands synchronously, and a `load`
  // island would hydrate before the URL is set.
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
