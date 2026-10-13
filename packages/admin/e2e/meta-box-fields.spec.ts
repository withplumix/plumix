import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { MetaBoxFieldManifestEntry } from "@plumix/core/manifest";
import { emptyManifest } from "@plumix/core/manifest";

import {
  AUTHED_ADMIN,
  mockManifest,
  rpcOkBody,
  withCapabilities,
} from "./support/rpc-mock.js";

const T0 = new Date("2026-05-20T00:00:00Z");

const AUTHED_AUTHOR_EDITOR = withCapabilities(
  AUTHED_ADMIN,
  "entry:author:edit_any",
  "entry:author:edit_own",
  "entry:author:publish",
  "entry:author:read",
);

function authorEntry(meta: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 1,
    type: "author",
    parentId: null,
    title: "Jane Doe",
    slug: "jane-doe",
    content: null,
    excerpt: null,
    status: "draft",
    authorId: 1,
    sortOrder: 0,
    publishedAt: null,
    createdAt: T0,
    updatedAt: T0,
    meta,
  };
}

interface EntryRpc {
  /** The input of each `entry/update` the page sent. */
  readonly updates: readonly { readonly meta?: Record<string, unknown> }[];
  /** The input of each `lookup/list` the page sent. */
  readonly lookups: readonly { readonly query?: string }[];
}

/**
 * Opens the author entry with `meta` stored, its one meta box declaring
 * `fields`. `lookup/list` answers with `lookupItems`; `entry/update` answers
 * with `updateRejection` when given, else with the entry.
 */
async function openEntry(
  page: Page,
  {
    fields,
    meta,
    lookupItems = [],
    updateRejection,
  }: {
    readonly fields: readonly MetaBoxFieldManifestEntry[];
    readonly meta: Record<string, unknown>;
    readonly lookupItems?: readonly Record<string, unknown>[];
    readonly updateRejection?: unknown;
  },
): Promise<EntryRpc> {
  await mockManifest(page, {
    ...emptyManifest(),
    entryTypes: [
      {
        name: "author",
        capabilityType: "author",
        adminSlug: "authors",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
        label: "Authors",
        labels: { singular: "Author", plural: "Authors" },
        supports: ["title", "slug"],
      },
    ],
    entryMetaBoxes: [
      { id: "fields", label: "Fields", entryTypes: ["author"], fields },
    ],
  });
  const updates: { meta?: Record<string, unknown> }[] = [];
  const lookups: { query?: string }[] = [];
  await page.route("**/_plumix/rpc/**", (route) => {
    const request = route.request();
    const url = request.url();
    const ok = (body: unknown): Promise<void> =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(body),
      });
    if (url.endsWith("/auth/session")) return ok(AUTHED_AUTHOR_EDITOR);
    if (url.endsWith("/entry/get")) return ok(authorEntry(meta));
    if (url.endsWith("/lookup/list")) {
      lookups.push(
        (request.postDataJSON() as { json: { query?: string } }).json,
      );
      return ok({ items: lookupItems });
    }
    if (url.endsWith("/entry/update")) {
      updates.push(
        (request.postDataJSON() as { json: { meta?: Record<string, unknown> } })
          .json,
      );
      if (updateRejection === undefined) return ok(authorEntry(meta));
      return route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ json: updateRejection, meta: [] }),
      });
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
  await page.goto("entries/authors/1/edit");
  await expect(page.getByTestId("plain-form-meta-box-fields")).toBeVisible();
  return { updates, lookups };
}

/** Saves the entry and returns the meta patch the save sent. */
async function saveMeta(
  page: Page,
  rpc: EntryRpc,
): Promise<Record<string, unknown> | undefined> {
  const before = rpc.updates.length;
  await page.getByTestId("plain-form-save-button").click();
  await expect.poll(() => rpc.updates.length).toBe(before + 1);
  return rpc.updates.at(-1)?.meta;
}

const AB_OPTIONS = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Bravo" },
];

test.describe("meta-box fields on the plain form", () => {
  test("choice controls save the picked option", async ({ page }) => {
    const rpc = await openEntry(page, {
      fields: [
        {
          key: "dropdown",
          label: "Dropdown",
          type: "string",
          inputType: "select",
          options: AB_OPTIONS,
        },
        {
          key: "legacyRadio",
          label: "Legacy radio",
          type: "string",
          inputType: "radio",
          options: AB_OPTIONS,
        },
        {
          key: "radios",
          label: "Radios",
          type: "string",
          inputType: "select",
          appearance: "radio",
          options: AB_OPTIONS,
        },
        {
          key: "buttons",
          label: "Buttons",
          type: "string",
          inputType: "select",
          appearance: "buttons",
          options: AB_OPTIONS,
        },
        {
          key: "featured",
          label: "Featured",
          type: "boolean",
          inputType: "checkbox",
        },
        {
          key: "live",
          label: "Live",
          type: "boolean",
          inputType: "toggle",
          onText: "Live",
          offText: "Draft",
        },
      ],
      meta: {
        dropdown: "a",
        legacyRadio: "a",
        radios: "a",
        buttons: "a",
        featured: false,
        live: false,
      },
    });

    await page.getByTestId("meta-box-field-dropdown-input").click();
    await page.getByTestId("meta-box-field-dropdown-input-option-b").click();
    await page.getByTestId("meta-box-field-legacyRadio-input-b").click();
    await page.getByTestId("meta-box-field-radios-input-b").click();
    await page.getByTestId("meta-box-field-buttons-input-b").click();
    await page.getByTestId("meta-box-field-featured-input").click();
    await page.getByTestId("meta-box-field-live-input").click();
    await expect(
      page.getByTestId("meta-box-field-live-input-state"),
    ).toHaveText("Live");

    expect(await saveMeta(page, rpc)).toEqual({
      dropdown: "b",
      legacyRadio: "b",
      radios: "b",
      buttons: "b",
      featured: true,
      live: true,
    });
  });

  test("the JSON field flags invalid JSON inline and saves valid JSON", async ({
    page,
  }) => {
    const rpc = await openEntry(page, {
      fields: [
        { key: "config", label: "Config", type: "json", inputType: "json" },
      ],
      meta: { config: { a: 1 } },
    });
    const editor = page.getByTestId("meta-box-field-config-input-code");

    await editor.click();
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText("{not-json");
    await expect(
      page.getByTestId("meta-box-field-config-input-error"),
    ).toHaveText("Invalid JSON");

    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.insertText('{"b":2}');
    await expect(
      page.getByTestId("meta-box-field-config-input-error"),
    ).toHaveCount(0);

    expect(await saveMeta(page, rpc)).toEqual({ config: { b: 2 } });
  });

  test("a link field picks a published entry and saves its permalink", async ({
    page,
  }) => {
    const rpc = await openEntry(page, {
      fields: [
        {
          key: "cta",
          label: "Call to action",
          type: "json",
          inputType: "link",
          prepend: "https://",
          append: "/",
        },
      ],
      meta: {},
      lookupItems: [
        {
          id: "1",
          label: "Pricing",
          targetType: "author",
          subtitle: "author · published",
          href: "/pricing",
        },
        { id: "2", label: "Internal", targetType: "author" },
      ],
    });
    // The adornments frame the address, not the link text.
    await expect(
      page.getByTestId("meta-box-field-cta-input-url-prepend"),
    ).toHaveText("https://");
    await expect(
      page.getByTestId("meta-box-field-cta-input-url-append"),
    ).toHaveText("/");
    await expect(
      page.getByTestId("meta-box-field-cta-input-label-prepend"),
    ).toHaveCount(0);

    await page.getByTestId("meta-box-field-cta-input-pick").click();
    await expect(
      page.getByTestId("meta-box-field-cta-input-option-1"),
    ).toBeVisible();
    await expect(
      page.getByTestId("meta-box-field-cta-input-option-2"),
    ).toHaveCount(0);
    await page.getByTestId("meta-box-field-cta-input-option-1").click();
    await expect(page.getByTestId("meta-box-field-cta-input-url")).toHaveValue(
      "/pricing",
    );

    expect(await saveMeta(page, rpc)).toEqual({ cta: { url: "/pricing" } });
  });

  test("a reference picker searches, picks, and saves the chosen id", async ({
    page,
  }) => {
    const rpc = await openEntry(page, {
      fields: [
        {
          key: "reviewer",
          label: "Reviewer",
          type: "string",
          inputType: "user",
          referenceTarget: { kind: "user" },
        },
      ],
      meta: {},
      lookupItems: [{ id: "7", label: "Ada" }],
    });

    await page.getByTestId("meta-box-field-reviewer-input-open").click();
    await page.getByTestId("meta-box-field-reviewer-input-search").fill("ad");
    await expect.poll(() => rpc.lookups.at(-1)?.query).toBe("ad");
    await page.getByTestId("meta-box-field-reviewer-input-option-7").click();
    await expect(
      page.getByTestId("meta-box-field-reviewer-input-selected"),
    ).toHaveText("Ada");

    expect(await saveMeta(page, rpc)).toEqual({ reviewer: "7" });
  });

  test("a group's members save under the group's key", async ({ page }) => {
    const rpc = await openEntry(page, {
      fields: [
        {
          key: "seo",
          label: "SEO",
          type: "json",
          inputType: "group",
          subFields: [
            { key: "title", label: "Title", type: "string", inputType: "text" },
            {
              key: "description",
              label: "Description",
              type: "string",
              inputType: "textarea",
            },
          ],
        },
      ],
      meta: { seo: { title: "", description: "" } },
    });

    await page.getByTestId("meta-box-field-title-input").fill("Hi");

    expect(await saveMeta(page, rpc)).toEqual({
      seo: { title: "Hi", description: "" },
    });
  });

  test("a repeater row added and filled in its dialog saves alongside earlier rows", async ({
    page,
  }) => {
    const rpc = await openEntry(page, {
      fields: [
        {
          key: "links",
          label: "Links",
          type: "json",
          inputType: "repeater",
          subFields: [
            { key: "label", label: "Label", type: "string", inputType: "text" },
            { key: "href", label: "URL", type: "string", inputType: "url" },
          ],
        },
      ],
      meta: { links: [{ label: "Home", href: "/" }] },
    });

    await page.getByTestId("meta-box-field-links-input-add").click();
    const dialog = page.getByTestId("meta-box-field-links-input-dialog");
    await dialog.getByTestId("meta-box-field-label-input").fill("Docs");
    await dialog.getByTestId("meta-box-field-href-input").fill("/docs");
    await page.getByTestId("meta-box-field-links-input-dialog-done").click();
    await expect(
      page.getByTestId("meta-box-field-links-input-row-1-summary"),
    ).toHaveText("Docs");

    expect(await saveMeta(page, rpc)).toEqual({
      links: [
        { label: "Home", href: "/" },
        { label: "Docs", href: "/docs" },
      ],
    });
  });

  test("a repeater row's dialog lays its fields out by their span", async ({
    page,
  }) => {
    await openEntry(page, {
      fields: [
        {
          key: "links",
          label: "Links",
          type: "json",
          inputType: "repeater",
          subFields: [
            {
              key: "label",
              label: "Label",
              type: "string",
              inputType: "text",
              span: 6,
            },
            { key: "href", label: "URL", type: "string", inputType: "url" },
          ],
        },
      ],
      meta: { links: [{ label: "Home", href: "/" }] },
    });

    await page.getByTestId("meta-box-field-links-input-row-0-edit").click();

    const dialog = page.getByTestId("meta-box-field-links-input-dialog");
    await expect(dialog.getByTestId("meta-box-field-label")).toHaveClass(
      /(^| )col-span-6( |$)/,
    );
    await expect(dialog.getByTestId("meta-box-field-href")).toHaveClass(
      /(^| )col-span-12( |$)/,
    );
  });

  test("a nested repeater opens inside its parent row's dialog", async ({
    page,
  }) => {
    await openEntry(page, {
      fields: [
        {
          key: "sections",
          label: "Sections",
          type: "json",
          inputType: "repeater",
          subFields: [
            {
              key: "heading",
              label: "Heading",
              type: "string",
              inputType: "text",
            },
            {
              key: "callouts",
              label: "Callouts",
              type: "json",
              inputType: "repeater",
              subFields: [
                {
                  key: "tone",
                  label: "Tone",
                  type: "string",
                  inputType: "text",
                },
              ],
            },
          ],
        },
      ],
      meta: { sections: [{ heading: "Intro", callouts: [] }] },
    });

    await page.getByTestId("meta-box-field-sections-input-row-0-edit").click();
    const parentDialog = page.getByTestId(
      "meta-box-field-sections-input-dialog",
    );
    await parentDialog.getByTestId("meta-box-field-callouts-input-add").click();

    await expect(
      page
        .getByTestId("meta-box-field-callouts-input-dialog")
        .getByTestId("meta-box-field-tone-input"),
    ).toBeVisible();
  });

  test("conditional fields show and hide as their driver changes, per repeater row", async ({
    page,
  }) => {
    await openEntry(page, {
      fields: [
        {
          key: "options",
          label: "Options",
          type: "json",
          inputType: "repeater",
          subFields: [
            { key: "kind", label: "Kind", type: "string", inputType: "text" },
            {
              key: "choices",
              label: "Choices",
              type: "string",
              inputType: "text",
              visibleWhen: [[{ key: "kind", op: "eq", value: "select" }]],
            },
          ],
        },
      ],
      meta: { options: [{ kind: "text" }, { kind: "select" }] },
    });
    const choices = page.getByTestId("meta-box-field-choices-input");

    // Row 0's driver reads "text"; editing it shows and hides its own cell.
    await page.getByTestId("meta-box-field-options-input-row-0-edit").click();
    await expect(page.getByTestId("meta-box-field-kind-input")).toBeVisible();
    await expect(choices).toHaveCount(0);
    await page.getByTestId("meta-box-field-kind-input").fill("select");
    await expect(choices).toBeVisible();
    await page.getByTestId("meta-box-field-kind-input").fill("text");
    await expect(choices).toHaveCount(0);
    await page.getByTestId("meta-box-field-options-input-dialog-done").click();
    await expect(
      page.getByTestId("meta-box-field-options-input-dialog"),
    ).toHaveCount(0);

    // Row 1 reads its own driver, not row 0's.
    await page.getByTestId("meta-box-field-options-input-row-1-edit").click();
    await expect(choices).toBeVisible();
  });

  test("a server rejection of a repeater cell flags its row and shows the message in the row's dialog", async ({
    page,
  }) => {
    const rpc = await openEntry(page, {
      fields: [
        {
          key: "sections",
          label: "Sections",
          type: "json",
          inputType: "repeater",
          subFields: [
            {
              key: "heading",
              label: "Heading",
              type: "string",
              inputType: "text",
            },
          ],
        },
      ],
      meta: { sections: [{ heading: "fine" }, { heading: "" }] },
      updateRejection: {
        defined: true,
        code: "CONFLICT",
        status: 409,
        message: "Resource conflict",
        data: {
          reason: "meta_invalid_value",
          key: "sections",
          errors: [
            {
              path: "sections.1.heading",
              message: {
                id: "metaField.required",
                message: "This field is required.",
              },
            },
          ],
        },
      },
    });

    await saveMeta(page, rpc);

    await expect(
      page.getByTestId("meta-box-field-sections-input-row-1-error"),
    ).toBeVisible();
    await expect(
      page.getByTestId("meta-box-field-sections-input-row-0-error"),
    ).toHaveCount(0);
    await page.getByTestId("meta-box-field-sections-input-row-1-edit").click();
    await expect(page.getByTestId("meta-box-field-heading-error")).toHaveText(
      "This field is required.",
    );
  });

  test("picking up a sortable row with the keyboard announces its position", async ({
    page,
  }) => {
    const rpc = await openEntry(page, {
      fields: [
        {
          key: "links",
          label: "Links",
          type: "json",
          inputType: "repeater",
          subFields: [
            { key: "label", label: "Label", type: "string", inputType: "text" },
          ],
        },
      ],
      meta: { links: [{ label: "One" }, { label: "Two" }] },
    });
    const handle = page.getByTestId(
      "meta-box-field-links-input-list-row-0-handle",
    );
    await expect(handle).toHaveAccessibleDescription(
      "To pick up an item, press space or enter. Use the arrow keys to move it. Press space or enter again to drop it, or escape to cancel.",
    );

    await handle.focus();
    await page.keyboard.press("Space");
    // dnd-kit's live region carries no test id, so read what it announced.
    await expect
      .poll(() => page.evaluate(() => document.body.textContent))
      .toContain("Picked up item 1 of 2.");
    // dnd-kit binds its arrow keys a tick after the pickup, unmarked on the
    // page. Pressing again from the last row is a no-op, so this can't overshoot.
    await expect(async () => {
      await page.keyboard.press("ArrowDown");
      expect(await page.evaluate(() => document.body.textContent)).toContain(
        "Item moved to position 2 of 2.",
      );
    }).toPass();
    await page.keyboard.press("Space");
    await expect(
      page.getByTestId("meta-box-field-links-input-row-0-summary"),
    ).toHaveText("Two");

    expect(await saveMeta(page, rpc)).toEqual({
      links: [{ label: "Two" }, { label: "One" }],
    });
  });
});
