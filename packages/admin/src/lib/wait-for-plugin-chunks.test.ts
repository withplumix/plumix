import { describe, expect, test } from "vitest";

import { waitForScriptsSettled } from "./wait-for-plugin-chunks.js";

/** Whether `promise` has settled once every queued microtask has run. */
async function isSettled(promise: Promise<unknown>): Promise<boolean> {
  let settled = false;
  void promise.then(() => {
    settled = true;
  });
  // A macrotask turn runs every microtask queued before it.
  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });
  return settled;
}

describe("waitForScriptsSettled", () => {
  test("resolves immediately when no plugin chunks are present", async () => {
    await expect(waitForScriptsSettled([])).resolves.toBeUndefined();
  });

  test("stays pending while a plugin script has not loaded", async () => {
    const media = new EventTarget();
    const menus = new EventTarget();
    const waiting = waitForScriptsSettled([media, menus]);

    media.dispatchEvent(new Event("load"));

    expect(await isSettled(waiting)).toBe(false);
  });

  test("resolves once every plugin script fires load", async () => {
    const media = new EventTarget();
    const menus = new EventTarget();
    const waiting = waitForScriptsSettled([media, menus]);

    media.dispatchEvent(new Event("load"));
    menus.dispatchEvent(new Event("load"));

    expect(await isSettled(waiting)).toBe(true);
  });

  test("treats error as settled so a broken plugin does not block the admin", async () => {
    const broken = new EventTarget();
    const ok = new EventTarget();
    const waiting = waitForScriptsSettled([broken, ok]);

    broken.dispatchEvent(new Event("error"));
    ok.dispatchEvent(new Event("load"));

    expect(await isSettled(waiting)).toBe(true);
  });
});
