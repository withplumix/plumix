import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpc,
} from "./support/rpc-mock.js";

// Records the types of every view transition the page starts, by wrapping
// `document.startViewTransition` before the bundle boots.
async function recordViewTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const recorded: (readonly string[] | null)[] = [];
    Object.assign(window, { __viewTransitions: recorded });
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (
      update?: ViewTransitionUpdateCallback | StartViewTransitionOptions,
    ) => {
      recorded.push(
        typeof update === "object" ? [...(update.types ?? [])] : null,
      );
      return start(update);
    };
  });
}

function viewTransitions(page: Page): Promise<(readonly string[] | null)[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __viewTransitions: (readonly string[] | null)[] })
        .__viewTransitions,
  );
}

async function openDashboard(page: Page): Promise<void> {
  await mockManifest(page, MANIFEST_WITH_POST);
  await mockRpc(page, {
    "/auth/session": AUTHED_ADMIN,
    "/entry/stats": [],
    "/entry/recentActivity": [],
    "/entry/list": [],
  });
  await page.goto("");
  await expect(page.getByTestId("dashboard-tile-post-link")).toBeVisible();
}

test.describe("admin navigation transitions", () => {
  test("navigating to another screen starts a view transition typed nav-forward", async ({
    page,
  }) => {
    await recordViewTransitions(page);
    await openDashboard(page);

    await page.getByTestId("dashboard-tile-post-link").click();
    await expect(page.getByTestId("content-list-heading")).toBeVisible();

    expect(await viewTransitions(page)).toEqual([["nav-forward"]]);
  });

  test("browser back starts one view transition typed nav-back", async ({
    page,
  }) => {
    await recordViewTransitions(page);
    await openDashboard(page);
    await page.getByTestId("dashboard-tile-post-link").click();
    await expect(page.getByTestId("content-list-heading")).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId("dashboard-tile-post-link")).toBeVisible();

    expect(await viewTransitions(page)).toEqual([
      ["nav-forward"],
      ["nav-back"],
    ]);
  });

  test("changing only a list's search params starts no view transition", async ({
    page,
  }) => {
    await recordViewTransitions(page);
    await openDashboard(page);
    await page.getByTestId("dashboard-tile-post-link").click();
    await expect(page.getByTestId("content-list-heading")).toBeVisible();

    // The list refetches only once the new search has rendered, after any
    // view transition the navigation would have started.
    const refetch = page.waitForRequest(
      (request) =>
        request.url().includes("/entry/list") &&
        (request.postData() ?? "").includes("quantum"),
    );
    await page.getByTestId("content-list-search-input").fill("quantum");
    await expect(page).toHaveURL(/q=quantum/);
    await refetch;

    expect(await viewTransitions(page)).toEqual([["nav-forward"]]);
  });

  test("a user who prefers reduced motion navigates with no view transition", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await recordViewTransitions(page);
    await openDashboard(page);

    await page.getByTestId("dashboard-tile-post-link").click();
    await expect(page.getByTestId("content-list-heading")).toBeVisible();

    expect(await viewTransitions(page)).toEqual([]);
  });

  test("the sidebar and header hold still, and a running transition never swallows a click", async ({
    page,
  }) => {
    await openDashboard(page);

    const names = await page.evaluate(() =>
      ['[data-slot="sidebar-container"]', '[data-slot="shell-header"]'].map(
        (selector) => {
          const element = document.querySelector(selector);
          return element === null
            ? null
            : getComputedStyle(element).viewTransitionName;
        },
      ),
    );
    expect(names).toEqual(["plumix-admin-sidebar", "plumix-admin-header"]);

    const pointerEvents = await page.evaluate(
      () =>
        getComputedStyle(document.documentElement, "::view-transition")
          .pointerEvents,
    );
    expect(pointerEvents).toBe("none");
  });
});

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
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", apply, { once: true });
      } else {
        apply();
      }
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
