import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_SETTINGS,
  mockManifest,
  mockRpc,
  mockSession,
  rpcEtagConflictBody,
  rpcLeaseBody,
  rpcLockedBody,
  rpcOkBody,
} from "./support/rpc-mock.js";

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
      "/settings/get": { etag: "0", values: {} },
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
      "/settings/get": { etag: "0", values: {} },
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
        etag: "3",
        values: { site_title: "Plumix", admin_email: "root@plumix.dev" },
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
      "/settings/get": { etag: "0", values: {} },
      "/settings/upsert": { etag: "1", values: { site_title: "Plumix" } },
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
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/settings/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ etag: "0", values: {} }),
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

  test("save rejection: per-field errors render on the inputs they address", async ({
    page,
  }) => {
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await page.route("**/_plumix/rpc/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/settings/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody({ etag: "0", values: {} }),
        });
      }
      if (url.endsWith("/settings/upsert")) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              defined: true,
              code: "CONFLICT",
              status: 409,
              message: "Resource conflict",
              data: {
                reason: "settings_invalid_value",
                key: "site.site_title",
                errors: [{ path: "site_title", message: "Too long" }],
              },
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });
    await page.goto("settings/general");
    await page.getByTestId("meta-box-field-site_title-input").fill("Plumix");
    await page.getByTestId("settings-submit-identity").click();
    await expect(
      page.getByTestId("meta-box-field-site_title-error"),
    ).toHaveText("Too long");
    // The inline message is the address — no generic banner, no success.
    await expect(
      page.getByTestId("settings-server-error-identity"),
    ).toHaveCount(0);
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

  async function mockSavedGroup(page: Page): Promise<{
    readonly upserts: Record<string, unknown>[];
    readonly saveElsewhere: (values: Record<string, unknown>) => void;
  }> {
    let saved = { etag: "0", values: { site_title: "Plumix" } };
    const upserts: Record<string, unknown>[] = [];
    await mockManifest(page, MANIFEST_WITH_SETTINGS);
    await mockRpc(page, { "/auth/session": AUTHED_ADMIN });
    await page.route("**/_plumix/rpc/settings/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(saved),
      }),
    );
    const save = (values: Record<string, unknown>): void => {
      saved = {
        etag: String(Number(saved.etag) + 1),
        values: { ...saved.values, ...values },
      };
    };
    await page.route("**/_plumix/rpc/settings/upsert", (route) => {
      const { ifMatch, values } = (
        route.request().postDataJSON() as {
          json: { ifMatch: string; values: Record<string, unknown> };
        }
      ).json;
      upserts.push({ ifMatch, ...values });
      if (ifMatch !== saved.etag) {
        // A settings group's token is a counter, so the conflict carries no
        // change time.
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: rpcEtagConflictBody(saved.etag),
        });
      }
      save(values);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(saved),
      });
    });
    return { upserts, saveElsewhere: save };
  }

  test("a save after another session saved the card opens the conflict dialog, and Load theirs shows that save", async ({
    page,
  }) => {
    const { saveElsewhere } = await mockSavedGroup(page);
    await page.goto("settings/general");
    const title = page.getByTestId("meta-box-field-site_title-input");
    await expect(title).toHaveValue("Plumix");
    saveElsewhere({ site_title: "Saved elsewhere" });

    await title.fill("Mine");
    await page.getByTestId("settings-submit-identity").click();

    await expect(page.getByTestId("entry-conflict-dialog")).toBeVisible();
    await page.getByTestId("entry-conflict-load-theirs").click();
    await expect(page.getByTestId("entry-conflict-dialog")).toBeHidden();
    await expect(title).toHaveValue("Saved elsewhere");
  });

  test("Keep mine in the card's conflict dialog saves the card over the other session's save", async ({
    page,
  }) => {
    const { upserts, saveElsewhere } = await mockSavedGroup(page);
    await page.goto("settings/general");
    const title = page.getByTestId("meta-box-field-site_title-input");
    await expect(title).toHaveValue("Plumix");
    saveElsewhere({ site_title: "Saved elsewhere" });
    await title.fill("Mine");
    await page.getByTestId("settings-submit-identity").click();
    await expect(page.getByTestId("entry-conflict-dialog")).toBeVisible();

    await page.getByTestId("entry-conflict-keep-mine").click();

    await expect(
      page.getByTestId("settings-save-notice-identity"),
    ).toBeVisible();
    expect(upserts).toEqual([
      expect.objectContaining({ ifMatch: "0", site_title: "Mine" }),
      expect.objectContaining({ ifMatch: "1", site_title: "Mine" }),
    ]);
  });

  test("while another admin edits a card, working in it shows who, and Take over makes it editable", async ({
    page,
  }) => {
    await mockSavedGroup(page);
    const ada = { id: 2, name: "Ada" };
    const since = new Date("2026-10-19T09:00:00Z");
    await page.route("**/_plumix/rpc/settings/lease/acquire", (route) => {
      const { takeOver } = (
        route.request().postDataJSON() as { json: { takeOver?: boolean } }
      ).json;
      return route.fulfill({
        status: takeOver === true ? 200 : 423,
        contentType: "application/json",
        body:
          takeOver === true
            ? rpcLeaseBody(AUTHED_ADMIN_HOLDER, since)
            : rpcLockedBody(ada, since),
      });
    });
    await page.goto("settings/general");
    const card = page.getByTestId("settings-group-card-identity");
    const title = page.getByTestId("meta-box-field-site_title-input");

    await title.focus();

    await expect(card.getByTestId("edit-lease-held-by")).toContainText(
      "Ada is editing these settings",
    );
    await expect(title).toBeDisabled();
    await expect(
      page
        .getByTestId("settings-group-card-contact")
        .getByTestId("edit-lease-banner"),
    ).toHaveCount(0);
    await card.getByTestId("edit-lease-take-over").click();
    await expect(card.getByTestId("edit-lease-banner")).toHaveCount(0);
    await expect(title).toBeEnabled();
  });
});

const AUTHED_ADMIN_HOLDER = { id: 1, name: "Admin" };
