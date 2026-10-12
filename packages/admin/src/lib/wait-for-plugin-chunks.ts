/**
 * Plugin chunks register at module-eval after `main.tsx`; mounting first would
 * leave a deep link on "Plugin not loaded". `error` resolves too.
 */
export async function waitForPluginChunks(): Promise<void> {
  await waitForScriptsSettled(
    document.querySelectorAll<HTMLScriptElement>("script[data-plumix-plugin]"),
  );
}

/** Resolves once every script has fired `load` or `error`. */
export async function waitForScriptsSettled(
  scripts: Iterable<EventTarget>,
): Promise<void> {
  await Promise.all(Array.from(scripts, waitForScriptSettled));
}

function waitForScriptSettled(script: EventTarget): Promise<void> {
  return new Promise((resolve) => {
    const settle = (): void => resolve();
    script.addEventListener("load", settle, { once: true });
    script.addEventListener("error", settle, { once: true });
  });
}
