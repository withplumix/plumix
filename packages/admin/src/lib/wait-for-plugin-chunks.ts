// Plugin admin chunks register their React components at module-eval
// time via `window.plumix.registerPluginPage(...)`. Their `<script
// type="module" data-plumix-plugin>` tags are injected after the main
// bundle in document order, so they evaluate after `main.tsx` runs.
// Mounting React without waiting renders the first route against an
// empty registry — a deep link to `/_plumix/admin/pages/<plugin>`
// lands on "Plugin not loaded" with no re-render to recover.
//
// Listener attachment is safe because this runs inside the main
// bundle's module evaluation, and module scripts evaluate in document
// order — later plugin tags can't have fired their load events yet.
// `error` resolves too so a single broken plugin chunk doesn't block
// the rest of the admin.
export async function waitForPluginChunks(): Promise<void> {
  const scripts = document.querySelectorAll<HTMLScriptElement>(
    "script[data-plumix-plugin]",
  );
  await Promise.all(Array.from(scripts).map(waitForScriptSettled));
}

function waitForScriptSettled(script: HTMLScriptElement): Promise<void> {
  return new Promise((resolve) => {
    const settle = (): void => resolve();
    script.addEventListener("load", settle, { once: true });
    script.addEventListener("error", settle, { once: true });
  });
}
