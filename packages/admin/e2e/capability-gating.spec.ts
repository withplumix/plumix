import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_CAPABILITY_GATES,
  mockManifest,
  rpcOkBody,
  withCapabilities,
} from "./support/rpc-mock.js";

const T0 = new Date("2026-05-20T00:00:00Z");

const AUTHED_LOW_CAP = withCapabilities(
  AUTHED_ADMIN,
  "entry:author:edit_any",
  "entry:author:edit_own",
  "entry:author:read",
);

const AUTHED_HIGH_CAP = withCapabilities(
  AUTHED_LOW_CAP,
  "entry:author:manage_internal_notes",
  "entry:author:view_secret_notes",
);

function authorEntry(id: number): Record<string, unknown> {
  return {
    id,
    type: "author",
    parentId: null,
    title: "Jane Doe",
    slug: `author-${String(id)}`,
    content: null,
    excerpt: null,
    status: "draft",
    authorId: 1,
    sortOrder: 0,
    publishedAt: null,
    createdAt: T0,
    updatedAt: T0,
    meta: { headline: "Staff writer" },
  };
}

test.describe("capability gating in plain-form route", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_CAPABILITY_GATES);
  });

  test("low-cap viewer: gated metabox + gated field both absent", async ({
    page,
  }) => {
    await page.route("**/_plumix/rpc/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_LOW_CAP),
        });
      }
      if (url.endsWith("/entry/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: authorEntry(1), meta: [] }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/authors/1/edit");

    await expect(
      page.getByTestId("plain-form-meta-box-public-bio"),
    ).toBeVisible();
    await expect(
      page.getByTestId("meta-box-field-headline-input"),
    ).toBeVisible();
    await expect(
      page.getByTestId("meta-box-field-secret_note-input"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("plain-form-meta-box-internal-notes"),
    ).toHaveCount(0);
  });

  test("high-cap viewer: gated metabox and gated field both visible", async ({
    page,
  }) => {
    await page.route("**/_plumix/rpc/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_HIGH_CAP),
        });
      }
      if (url.endsWith("/entry/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: authorEntry(1), meta: [] }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/authors/1/edit");

    await expect(
      page.getByTestId("plain-form-meta-box-public-bio"),
    ).toBeVisible();
    await expect(
      page.getByTestId("meta-box-field-headline-input"),
    ).toBeVisible();
    await expect(
      page.getByTestId("meta-box-field-secret_note-input"),
    ).toBeVisible();
    await expect(
      page.getByTestId("plain-form-meta-box-internal-notes"),
    ).toBeVisible();
  });
});
