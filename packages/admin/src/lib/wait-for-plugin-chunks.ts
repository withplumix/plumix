// Plugin admin chunks register their React components at module-eval
// time via `window.plumix.registerPluginPage(...)`. Their `<script
// type="module" data-plumix-plugin>` tags are injected after the main
// bundle in document order, so they evaluate AFTER `main.tsx` runs.
// If we mounted React synchronously here, the very first route render
// would happen with an empty registry — a direct hit on
// `/_plumix/admin/pages/<plugin>` would land on "Plugin not loaded"
// even though the plugin would register a tick later. Waiting for
// every plugin script's `load`/`error` event before mounting closes
// that race.
//
// Safe re: listener attachment: this runs inside the main bundle's
// module evaluation, and module scripts evaluate in document order, so
// later plugin script tags cannot have fired their load events yet.
// On `error` we still resolve so a single broken plugin doesn't block
// the whole admin — that page falls back to "Plugin not loaded" while
// the rest of the app works.
export function waitForPluginChunks(doc: Document = document): Promise<void> {
  const scripts = doc.querySelectorAll<HTMLScriptElement>(
    "script[data-plumix-plugin]",
  );
  if (scripts.length === 0) return Promise.resolve();
  return Promise.all(Array.from(scripts).map(waitForScriptSettled)).then(
    () => undefined,
  );
}

function waitForScriptSettled(script: HTMLScriptElement): Promise<void> {
  return new Promise((resolve) => {
    const done = (): void => resolve();
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", done, { once: true });
  });
}
