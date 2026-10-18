// The plain-form route for non-editor entry types: Card-based layout,
// publish/save envelope contracts, and capability gating across both
// metabox and field levels.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_CAPABILITY_GATES,
  MANIFEST_WITH_PLAIN_FORM_TYPE,
  mockManifest,
  mockRpc,
  mockRpcWithCapture,
  rpcEtagConflictBody,
  rpcOkBody,
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
    etag: "e0",
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

  test("an edit autosaves through entry.update without pressing Save", async ({
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

    await page.getByTestId("plain-form-title-input").fill("Jane Q. Doe");

    await expect
      .poll(() => captures)
      .toEqual([expect.objectContaining({ title: "Jane Q. Doe" })]);
  });

  test("leaving the plain form with an unsaved edit still saves it", async ({
    page,
  }) => {
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...authorEntry(1), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_AUTHOR_EDITOR,
        "/entry/list": [authorEntry(1)],
        "/entry/get": authorEntry(1),
      },
    });
    await page.clock.install();
    await page.goto("entries/authors");
    await page.getByTestId("content-list-row-1").click();
    await expect(page.getByTestId("plain-form-title-input")).toHaveValue(
      "Jane Doe",
    );
    // Held clock: the autosave debounce never elapses, so only leaving sends.
    await page.clock.pauseAt(Date.now() + 60_000);

    await page.getByTestId("plain-form-title-input").fill("Jane Q. Doe");
    await page.goBack();

    await expect(page.getByTestId("plain-form-layout")).toHaveCount(0);
    await expect
      .poll(() => captures)
      .toEqual([expect.objectContaining({ title: "Jane Q. Doe" })]);
  });

  test("a rejected save pins the server's field error on its input, and the next save clears it", async ({
    page,
  }) => {
    await mockManifest(page, {
      ...MANIFEST_WITH_PLAIN_FORM_TYPE,
      entryMetaBoxes: [
        {
          id: "bio",
          label: "Biography",
          entryTypes: ["author"],
          fields: [
            {
              key: "headline",
              label: "Headline",
              type: "string",
              inputType: "text",
              prepend: "Title:",
            },
          ],
        },
      ],
    });
    await mockRpc(page, {
      "/auth/session": AUTHED_AUTHOR_EDITOR,
      "/entry/get": authorEntry(1),
    });
    let saves = 0;
    await page.route("**/_plumix/rpc/entry/update", (route) => {
      saves += 1;
      if (saves > 1) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(authorEntry(1)),
        });
      }
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
              reason: "meta_invalid_value",
              key: "headline",
              errors: [{ path: "headline", message: "Headline is taken" }],
            },
          },
          meta: [],
        }),
      });
    });
    await page.goto("entries/authors/1/edit");
    const input = page.getByTestId("meta-box-field-headline-input");
    const error = page.getByTestId("meta-box-field-headline-error");

    await page.getByTestId("plain-form-save-button").click();

    await expect(error).toHaveText("Headline is taken");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    // An autosave, not Save: submitting the form would clear the pin by itself.
    await page.getByTestId("plain-form-title-input").fill("Jane Q. Doe");
    await expect(error).toHaveCount(0);
    await expect(input).not.toHaveAttribute("aria-invalid", "true");
  });

  // A field default is only the starting value of a new entry (ADR 0026): an
  // entry whose author cleared the field opens empty and saves without it.
  test("a cleared defaulted field opens empty and the next save leaves it out", async ({
    page,
  }) => {
    const bio = MANIFEST_WITH_PLAIN_FORM_TYPE.entryMetaBoxes?.[0];
    if (!bio) throw new Error("the plain-form fixture lost its bio box");
    await mockManifest(page, {
      ...MANIFEST_WITH_PLAIN_FORM_TYPE,
      entryMetaBoxes: [
        {
          ...bio,
          fields: [
            ...bio.fields,
            {
              key: "followers",
              label: "Followers",
              type: "number",
              inputType: "number",
              default: 100,
            },
          ],
        },
      ],
    });
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...authorEntry(1), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_AUTHOR_EDITOR,
        "/entry/get": authorEntry(1),
      },
    });

    await page.goto("entries/authors/1/edit");
    await expect(
      page.getByTestId("meta-box-field-followers-input"),
    ).toHaveValue("");
    await page.getByTestId("plain-form-title-input").fill("Jane Q. Doe");
    await page.getByTestId("plain-form-save-button").click();

    await expect.poll(() => captures.length).toBeGreaterThan(0);
    const lastInput = captures.at(-1) as { readonly meta?: object };
    expect(lastInput.meta ?? {}).not.toHaveProperty("followers");
  });

  // One saved author a second session can save, its `entry.update` checking
  // `ifMatch` as the server does.
  async function mockSavedAuthor(page: Page): Promise<{
    readonly updates: Record<string, unknown>[];
    readonly saveElsewhere: (changes: Record<string, unknown>) => void;
  }> {
    let saved: Record<string, unknown> = authorEntry(1);
    let version = 0;
    const updates: Record<string, unknown>[] = [];
    await mockRpc(page, { "/auth/session": AUTHED_AUTHOR_EDITOR });
    await page.route("**/_plumix/rpc/entry/get", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(saved),
      }),
    );
    const save = (changes: Record<string, unknown>): void => {
      version += 1;
      saved = { ...saved, ...changes, etag: `e${String(version)}` };
    };
    await page.route("**/_plumix/rpc/entry/update", (route) => {
      const {
        ifMatch,
        id: _id,
        ...changes
      } = (route.request().postDataJSON() as { json: Record<string, unknown> })
        .json;
      updates.push({ ifMatch, ...changes });
      if (ifMatch !== saved.etag) {
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: rpcEtagConflictBody(
            String(saved.etag),
            new Date("2026-05-20T09:30:00Z"),
          ),
        });
      }
      save(changes);
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(saved),
      });
    });
    return { updates, saveElsewhere: save };
  }

  async function openConflictDialog(page: Page): Promise<{
    readonly updates: Record<string, unknown>[];
  }> {
    const { updates, saveElsewhere } = await mockSavedAuthor(page);
    await page.goto("entries/authors/1/edit");
    await expect(page.getByTestId("plain-form-title-input")).toHaveValue(
      "Jane Doe",
    );
    saveElsewhere({ title: "Saved elsewhere" });
    await page.getByTestId("plain-form-title-input").fill("My title");
    await expect(page.getByTestId("entry-conflict-dialog")).toBeVisible();
    return { updates };
  }

  test("an edit made after another session saved opens the conflict dialog, and Load theirs shows that save", async ({
    page,
  }) => {
    await openConflictDialog(page);

    await page.getByTestId("entry-conflict-load-theirs").click();

    await expect(page.getByTestId("entry-conflict-dialog")).toBeHidden();
    await expect(page.getByTestId("plain-form-title-input")).toHaveValue(
      "Saved elsewhere",
    );
  });

  test("Keep mine in the conflict dialog saves the local edit over the other session's", async ({
    page,
  }) => {
    const { updates } = await openConflictDialog(page);

    await page.getByTestId("entry-conflict-keep-mine").click();

    await expect(page.getByTestId("entry-conflict-dialog")).toBeHidden();
    await expect
      .poll(() => updates.at(-1))
      .toMatchObject({ ifMatch: "e1", title: "My title" });
    expect(updates).toHaveLength(2);
  });

  test("Compare in the conflict dialog shows the local edit beside the other session's save", async ({
    page,
  }) => {
    await openConflictDialog(page);

    await page.getByTestId("entry-conflict-compare").click();

    await expect(
      page.getByTestId("entry-conflict-compare-panes"),
    ).toContainText("My title");
    await expect(
      page.getByTestId("entry-conflict-compare-panes"),
    ).toContainText("Saved elsewhere");
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
