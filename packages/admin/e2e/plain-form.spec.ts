// The plain-form route for non-editor entry types: Card-based layout,
// publish/save envelope contracts, and capability gating across both
// metabox and field levels.

import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_CAPABILITY_GATES,
  MANIFEST_WITH_PLAIN_FORM_TYPE,
  mockManifest,
  mockRpc,
  mockRpcWithCapture,
  withCapabilities,
} from "./support/rpc-mock.js";

const T0 = new Date("2026-05-20T00:00:00Z");

const AUTHED_AUTHOR_EDITOR = withCapabilities(
  AUTHED_ADMIN,
  "entry:author:create",
  "entry:author:edit_any",
  "entry:author:edit_own",
  "entry:author:publish",
  "entry:author:read",
  "entry:author:delete",
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
    meta: { headline: "Staff writer", twitter: "@jane" },
  };
}

test.describe("plain-form route for non-editor entry types", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_PLAIN_FORM_TYPE);
  });

  test("renders the Card-based plain form when the entry type lacks editor support", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_AUTHOR_EDITOR,
      "/entry/get": authorEntry(1),
    });

    await page.goto("entries/authors/1/edit");

    await expect(page.getByTestId("plain-form-layout")).toBeVisible();
    await expect(page.getByTestId("plain-form-header")).toBeVisible();
    await expect(page.getByTestId("plain-form-title-input")).toHaveValue(
      "Jane Doe",
    );
    await expect(page.getByTestId("plain-form-status-pill")).toHaveText(
      "Saved",
    );
    await expect(page.getByTestId("plain-form-save-button")).toBeVisible();
    await expect(page.getByTestId("plain-form-publish-button")).toBeVisible();

    const card = page.getByTestId("plain-form-meta-box-bio");
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute(
      "aria-labelledby",
      "plain-form-meta-box-heading-bio",
    );
    await expect(
      page.getByTestId("plain-form-meta-box-heading-bio"),
    ).toHaveText("Biography");
    await expect(
      card.getByTestId("meta-box-field-headline-input"),
    ).toBeVisible();
    await expect(
      card.getByTestId("meta-box-field-twitter-input"),
    ).toBeVisible();

    await expectNoAxeViolations(page);
  });

  test("Publish button submits an entry.update with status: published", async ({
    page,
  }) => {
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: {
        ...authorEntry(1),
        status: "published",
        publishedAt: T0,
      },
      handlers: {
        "/auth/session": AUTHED_AUTHOR_EDITOR,
        "/entry/get": authorEntry(1),
      },
    });

    await page.goto("entries/authors/1/edit");
    await page.getByTestId("plain-form-publish-button").click();

    await expect
      .poll(
        () =>
          (captures.at(-1) as { status?: string } | undefined)?.status ?? null,
      )
      .toBe("published");
  });

  test("Save button submits an entry.update preserving the current status", async ({
    page,
  }) => {
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...authorEntry(1), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_AUTHOR_EDITOR,
        "/entry/get": authorEntry(1),
      },
    });

    await page.goto("entries/authors/1/edit");
    await page.getByTestId("plain-form-save-button").click();

    await expect.poll(() => captures.length).toBeGreaterThan(0);
    const lastInput = captures.at(-1) as {
      readonly id: number;
      readonly status: string;
    };
    expect(lastInput.id).toBe(1);
    expect(lastInput.status).toBe("draft");
  });
});

test.describe("capability gating in plain-form route", () => {
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

  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_CAPABILITY_GATES);
  });

  test("low-cap viewer: gated metabox + gated field both absent", async ({
    page,
  }) => {
    await mockRpc(page, {
      "/auth/session": AUTHED_LOW_CAP,
      "/entry/get": authorEntry(1),
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
    await mockRpc(page, {
      "/auth/session": AUTHED_HIGH_CAP,
      "/entry/get": authorEntry(1),
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
