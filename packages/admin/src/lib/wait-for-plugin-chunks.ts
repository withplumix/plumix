// Plugin chunks register at module-eval after `main.tsx`; mounting first would
// leave a deep link on "Plugin not loaded". `error` resolves too.
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
