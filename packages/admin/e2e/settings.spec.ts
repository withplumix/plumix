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
//   - /settings — the page index
//   - /settings/$group — one page per registered group, rendering every
//     declared fieldset as a native `<fieldset>` with `<legend>`
// Scope: the plugin-facing contract end-to-end (group → fieldsets →
// fields) and the option.getMany/set round-trips. Doesn't exercise
// boolean / number / select field types — those land when we widen
// `SettingsFieldType` beyond `text | textarea`.

test.describe("/settings (group index)", () => {
  test("admin sees a card per registered group; each links into its form", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await mockSession(page, AUTHED_ADMIN);
    await page.goto("settings");
    await expect(page.getByTestId("settings-heading")).toBeVisible();
    const link = page.getByTestId("settings-group-link-general");
    await expect(link).toHaveAttribute("href", /\/settings\/general$/);
    await expectNoAxeViolations(page);
  });

  test("empty-state card renders when no groups are registered", async ({
    page,
  }) => {
    await mockSession(page, AUTHED_ADMIN);
    await page.goto("settings");
    await expect(page.getByTestId("settings-empty-state")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("non-admin without option:manage is redirected home", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    const adminUser = AUTHED_ADMIN.user;
    if (!adminUser) throw new Error("AUTHED_ADMIN fixture missing user");
    await mockSession(page, {
      user: {
        ...adminUser,
        role: "editor",
        capabilities: ["post:edit_own"],
      },
      needsBootstrap: false,
    });
    await page.goto("settings");
    await expect(page).toHaveURL(/\/(?:$|_plumix\/admin\/$)/);
  });
});

test.describe("/settings/$group", () => {
  test("renders each declared fieldset with its legend + fields", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/option/getMany": {},
    });
    await page.goto("settings/general");
    await expect(page.getByTestId("settings-group-heading")).toBeVisible();
    // Both fieldsets render with their legends.
    await expect(
      page.getByTestId("settings-fieldset-legend-identity"),
    ).toHaveText("Identity");
    await expect(
      page.getByTestId("settings-fieldset-legend-contact"),
    ).toHaveText("Contact");
    // Fields inside each fieldset are reachable by the flat testid —
    // storage keys are flat across fieldsets.
    await expect(page.getByTestId("settings-field-site_title")).toBeVisible();
    await expect(page.getByTestId("settings-field-admin_email")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("empty fetch — fields start empty (no stored values, no defaults)", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/option/getMany": {},
    });
    await page.goto("settings/general");
    await expect(page.getByTestId("settings-field-site_title")).toHaveValue("");
    await expect(page.getByTestId("settings-field-admin_email")).toHaveValue(
      "",
    );
  });

  test("hydrates field values from option.getMany across fieldsets", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/option/getMany": {
        // Storage is flat — fieldsets don't namespace the key, only
        // `groupName.fieldName`. Same key works across fieldsets.
        "general.site_title": "Plumix",
        "general.admin_email": "root@plumix.dev",
      },
    });
    await page.goto("settings/general");
    await expect(page.getByTestId("settings-field-site_title")).toHaveValue(
      "Plumix",
    );
    await expect(page.getByTestId("settings-field-admin_email")).toHaveValue(
      "root@plumix.dev",
    );
    await expect(
      page.getByTestId("settings-field-site_description"),
    ).toHaveValue("");
  });

  test("save: submit fires option.set per field; success notice renders", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await mockRpc(page, {
      "/auth/session": AUTHED_ADMIN,
      "/option/getMany": {},
      "/option/set": {
        name: "general.site_title",
        value: "New",
        isAutoloaded: true,
      },
    });
    await page.goto("settings/general");
    await page.getByTestId("settings-field-site_title").fill("Plumix");
    await page.getByTestId("settings-submit").click();
    await expect(page.getByTestId("settings-save-notice")).toBeVisible();
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
      if (url.endsWith("/option/getMany")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: {}, meta: [] }),
        });
      }
      if (url.endsWith("/option/set")) {
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
    await page.getByTestId("settings-field-site_title").fill("Plumix");
    await page.getByTestId("settings-submit").click();
    await expect(page.getByTestId("settings-server-error")).toBeVisible();
    // Success notice must NOT appear when the save errored.
    await expect(page.getByTestId("settings-save-notice")).toHaveCount(0);
  });

  test("unregistered group surfaces the router 404", async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await mockSession(page, AUTHED_ADMIN);
    await page.goto("settings/nonexistent");
    await expect(page.getByTestId("not-found-page")).toBeVisible();
  });
});
