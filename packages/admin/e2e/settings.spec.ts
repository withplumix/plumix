import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_SETTINGS,
  mockManifest,
  mockRpc,
  mockSession,
} from "./support/rpc-mock.js";

// The settings admin surface:
//   - /settings — the page index (one link per registered settings page)
//   - /settings/$page — one admin page per registered page, rendering
//     each referenced group as its own shadcn Card with per-card save.
// Scope: the plugin-facing contract end-to-end (page → groups → fields)
// and the settings.get/upsert round-trips. Doesn't exercise boolean /
// number / select field types — those land when we widen
// `SettingsFieldType` beyond `text | textarea`.

test.describe("/settings (page index)", () => {
  test("admin sees a card per registered page; each links into its form", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await mockSession(page, AUTHED_ADMIN);
    await page.goto("settings");
    await expect(page.getByTestId("settings-heading")).toBeVisible();
    const link = page.getByTestId("settings-page-link-general");
    await expect(link).toHaveAttribute("href", /\/settings\/general$/);
    await expectNoAxeViolations(page);
  });

  test("empty-state card renders when no pages are registered", async ({
    page,
  }) => {
    await mockSession(page, AUTHED_ADMIN);
    await page.goto("settings");
    await expect(page.getByTestId("settings-empty-state")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("non-admin without settings:manage is redirected home", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    const adminUser = AUTHED_ADMIN.user;
    if (!adminUser) throw new Error("AUTHED_ADMIN fixture missing user");
    await mockSession(page, {
      user: {
        ...adminUser,
        role: "editor",
        capabilities: ["entry:post:edit_own"],
      },
      needsBootstrap: false,
    });
    await page.goto("settings");
    await expect(page).toHaveURL(/\/(?:$|_plumix\/admin\/$)/);
  });
});

test.describe("/settings/$page", () => {
  test("renders one card per referenced group with title + description", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/settings/get": {},
    });
    await page.goto("settings/general");
    await expect(page.getByTestId("settings-page-heading")).toBeVisible();
    // One card per group in the MANIFEST_WITH_SETTINGS page.
    await expect(
      page.getByTestId("settings-group-card-identity"),
    ).toBeVisible();
    await expect(page.getByTestId("settings-group-card-contact")).toBeVisible();
    // Fields are scoped by group in their testids — two groups, two save buttons.
    await expect(
      page.getByTestId("meta-box-field-site_title-input"),
    ).toBeVisible();
    await expect(
      page.getByTestId("meta-box-field-admin_email-input"),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("empty fetch — fields start empty (no stored values, no defaults)", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/settings/get": {},
    });
    await page.goto("settings/general");
    await expect(
      page.getByTestId("meta-box-field-site_title-input"),
    ).toHaveValue("");
    await expect(
      page.getByTestId("meta-box-field-admin_email-input"),
    ).toHaveValue("");
  });

  test("hydrates field values from settings.get for each group", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    // All `settings.get` calls return the same fixture here; in practice
    // each group's bag is independent, but the mock surface is path-based
    // and the admin fans out one request per group.
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/settings/get": {
        site_title: "Plumix",
        admin_email: "root@plumix.dev",
      },
    });
    await page.goto("settings/general");
    await expect(
      page.getByTestId("meta-box-field-site_title-input"),
    ).toHaveValue("Plumix");
    await expect(
      page.getByTestId("meta-box-field-admin_email-input"),
    ).toHaveValue("root@plumix.dev");
  });

  test("save: submitting a card fires settings.upsert; success notice renders", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/settings/get": {},
      "/settings/upsert": { site_title: "Plumix" },
    });
    await page.goto("settings/general");
    await page.getByTestId("meta-box-field-site_title-input").fill("Plumix");
    await page.getByTestId("settings-submit-identity").click();
    await expect(
      page.getByTestId("settings-save-notice-identity"),
    ).toBeVisible();
  });

  test("save failure: RPC rejection surfaces the server-error alert", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await page.route("**/_plumix/rpc/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: AUTHED_ADMIN, meta: [] }),
        });
      }
      if (url.endsWith("/settings/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: {}, meta: [] }),
        });
      }
      if (url.endsWith("/settings/upsert")) {
        // oRPC's error wire format — match what the server emits so the
        // client's error pipeline surfaces the message through to the
        // mutation's `onError`.
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            defined: false,
            code: "INTERNAL_SERVER_ERROR",
            status: 500,
            message: "Storage is unavailable",
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });
    await page.goto("settings/general");
    await page.getByTestId("meta-box-field-site_title-input").fill("Plumix");
    await page.getByTestId("settings-submit-identity").click();
    await expect(
      page.getByTestId("settings-server-error-identity"),
    ).toBeVisible();
    // Success notice must NOT appear when the save errored.
    await expect(page.getByTestId("settings-save-notice-identity")).toHaveCount(
      0,
    );
  });

  test("unregistered page surfaces the router 404", async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await mockSession(page, AUTHED_ADMIN);
    await page.goto("settings/nonexistent");
    await expect(page.getByTestId("not-found-page")).toBeVisible();
  });
});
