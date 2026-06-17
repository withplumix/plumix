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
});
