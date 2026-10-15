import type { Page } from "@playwright/test";

/**
 * `load` does not wait for the dev client's dynamic import. Its console patch
 * installs with the overlays, so a patched `console.error` means they listen.
 */
export async function waitForDevClient(page: Page): Promise<void> {
  await page.waitForFunction(
    () => !String(console.error).includes("[native code]"),
  );
}
