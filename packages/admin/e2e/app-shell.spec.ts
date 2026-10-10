import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpc,
} from "./support/rpc-mock.js";

type StartViewTransitionArg =
  ViewTransitionUpdateCallback | StartViewTransitionOptions | undefined;

/**
 * Records the argument of every view transition the page starts, by wrapping
 * `document.startViewTransition` before the bundle boots.
 */
async function recordViewTransitions(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const recorded: StartViewTransitionArg[] = [];
    Object.assign(window, { __viewTransitions: recorded });
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (update?: StartViewTransitionArg) => {
      recorded.push(update);
      return start(update);
    };
  });
}

/**
 * The recorded arguments as they cross into the test: an options object keeps
 * its `types`, a bare update callback arrives as `undefined`.
 */
function viewTransitions(page: Page): Promise<StartViewTransitionArg[]> {
  return page.evaluate(
    () =>
      (window as unknown as { __viewTransitions: StartViewTransitionArg[] })
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

    expect(await viewTransitions(page)).toMatchObject([
      { types: ["nav-forward"] },
    ]);
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

    expect(await viewTransitions(page)).toMatchObject([
      { types: ["nav-forward"] },
      { types: ["nav-back"] },
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

    expect(await viewTransitions(page)).toMatchObject([
      { types: ["nav-forward"] },
    ]);
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

    const sidebarName = await page
      .locator('[data-slot="sidebar-container"]')
      .evaluate((element) => getComputedStyle(element).viewTransitionName);
    const headerName = await page
      .locator('[data-slot="shell-header"]')
      .evaluate((element) => getComputedStyle(element).viewTransitionName);
    expect(sidebarName).toBe("plumix-admin-sidebar");
    expect(headerName).toBe("plumix-admin-header");

    const pointerEvents = await page.evaluate(
      () =>
        getComputedStyle(document.documentElement, "::view-transition")
          .pointerEvents,
    );
    expect(pointerEvents).toBe("none");
  });
});

// A plugin chunk's CSS sidecar re-emitting `.hidden` once overrode the
// sidebar's `md:block`; globals.css orders `plumix-plugins` below `utilities`.
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

    // What a plugin sidecar emits; it must not beat the sidebar's `md:block`.
    await page.addStyleTag({
      content: "@layer plumix-plugins{.hidden{display:none}}",
    });

    await expect(sidebar).toBeVisible();
    const display = await sidebar.evaluate(
      (el) => getComputedStyle(el).display,
    );
    expect(display).toBe("block");
  });

  // Radix behaviour depends on its resolved package instance, so only a real
  // browser proves it. Reads radix's `dir` attribute, not CSS `direction`,
  // which the portal inherits from `<html dir>` regardless.
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
