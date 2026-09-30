class AdminPluginRegistryError extends Error {
  constructor(code: string, message: string) {
    super(`${code}: ${message}`);
  }
}

export const registryError = new AdminPluginRegistryError(
  "duplicate_key",
  "Two plugins are claiming the same key; rename one.",
);

export function listen(script: EventTarget, onLoad: () => void): () => void {
  script.addEventListener("load", onLoad);
  return () => script.removeEventListener("change", onLoad);
}

export const wide = window.matchMedia("(min-width: 48rem)");

export const routerOptions = { defaultPreload: "intent" };

export const heading = "Plugin not loaded";
