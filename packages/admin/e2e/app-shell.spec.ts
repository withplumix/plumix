import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpc,
} from "./support/rpc-mock.js";

// The sidebar collapse was an admin-chrome bug, not a plugin one: a plugin
// admin chunk's CSS sidecar re-emitted base utilities (e.g. `.hidden`) and,
// loading after the admin stylesheet, overrode the sidebar's responsive
// `md:block`. globals.css fixes it by ordering the `plumix-plugins` layer
// below the admin's own `utilities`. This guards that end-to-end so the
// regression can't recur regardless of which plugin is installed. The
// layer-order *contract* is unit-tested in src/styles/globals.test.ts.
test.describe("admin shell", () => {
  test("a plugin CSS sidecar cannot collapse the sidebar", async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/stats": [],
      "/entry/recentActivity": [],
    });
    await page.goto("");

    const sidebar = page.locator('[data-slot="sidebar"]').first();
    await expect(sidebar).toBeVisible();

    // Inject exactly what a plugin sidecar emits: a base utility re-declared
    // in the `plumix-plugins` layer, added after the admin CSS. It must NOT
    // beat the sidebar's `md:block` — i.e. `plumix-plugins` must stay below
    // the admin's `utilities` layer.
    await page.addStyleTag({
      content: "@layer plumix-plugins{.hidden{display:none}}",
    });

    await expect(sidebar).toBeVisible();
    const display = await sidebar.evaluate(
      (el) => getComputedStyle(el).display,
    );
    expect(display).toBe("block");
  });

  // RTL is a shipped launch locale (`ar`), so prove the direction context
  // reaches radix primitives in a real browser — the unit guard in
  // App.direction.test.tsx can't, since radix's behaviour depends on its
  // own resolved package instance at runtime. SSR normally sets
  // `<html dir>`; the SPA preview has no SSR, so seed it the same way the
  // locale-switch reload path does, before the bundle boots.
  //
  // The assertion reads the `dir` attribute radix writes onto the menu's
  // `role="menu"` element *from its DirectionProvider context* — not the
  // CSS `direction`, which the portaled content would inherit from
  // `<html dir>` regardless of whether the provider chain works. If the
  // provider ever re-splits from the primitives (the original bug), this
  // attribute reads "ltr" even under `<html dir="rtl">`.
  test("radix primitives inherit RTL from the direction provider under ar", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // At document-start `document.documentElement` isn't parsed yet, so
      // defer to DOMContentLoaded — still well before the admin's deferred
      // `createRoot().render()` reads `<html dir>` via `useDir()`.
      const apply = (): void => {
        document.documentElement.setAttribute("dir", "rtl");
        document.documentElement.setAttribute("lang", "ar");
      };
      if (document.documentElement) apply();
      else document.addEventListener("DOMContentLoaded", apply, { once: true });
    });
    await mockManifest(page, MANIFEST_WITH_POST);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/entry/stats": [],
      "/entry/recentActivity": [],
    });
    await page.goto("");

    await page.getByTestId("user-menu-trigger").click();

    const signOut = page.getByTestId("user-menu-sign-out");
    await expect(signOut).toBeVisible();
    const menuDir = await signOut.evaluate(
      (el) => el.closest('[role="menu"]')?.getAttribute("dir") ?? null,
    );
    expect(menuDir).toBe("rtl");
  });
});
