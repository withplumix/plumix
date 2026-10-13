import type { Page } from "@playwright/test";

/** Holds every request for `pattern` until the returned release is called. */
export async function holdRequests(
  page: Page,
  pattern: string,
): Promise<() => void> {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(pattern, async (route) => {
    await released;
    await route.continue();
  });
  return release;
}
