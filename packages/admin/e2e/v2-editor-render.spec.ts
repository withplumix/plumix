import { expect, test } from "@playwright/test";

import { expectNoAxeViolations } from "./support/axe.js";
import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  mockRpcWithCapture,
  rpcErrorBody,
  rpcOkBody,
} from "./support/rpc-mock.js";

const T0 = new Date("2026-05-20T00:00:00Z");

function emptyEntry(id: number): Record<string, unknown> {
  return {
    id,
    type: "post",
    parentId: null,
    title: "Untitled",
    slug: `entry-${String(id)}`,
    content: null,
    excerpt: null,
    status: "draft",
    authorId: 1,
    sortOrder: 0,
    publishedAt: null,
    createdAt: T0,
    updatedAt: T0,
    meta: {},
  };
}

test.describe("V2 spike editor renders end-to-end", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/entry/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: emptyEntry(1), meta: [] }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });
  });

  test("desktop chrome renders: header, left sidebar tabs, canvas, right sidebar tabs", async ({
    page,
  }) => {
    await page.goto("v2/entries/posts/1/edit");

    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-header")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-title-input")).toBeVisible();
    await expect(page.getByTestId("plumix-autosave-pill")).toBeVisible();
    await expect(page.getByTestId("plumix-autosave-pill")).toHaveText("Saved");
    await expect(page.getByTestId("plumix-editor-publish-button")).toBeVisible();

    await expect(page.getByTestId("plumix-editor-left")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-tab-blocks")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-tab-outline")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-tab-audit")).toBeVisible();

    await expect(page.getByTestId("plumix-editor-canvas")).toBeVisible();

    await expect(page.getByTestId("plumix-editor-right")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-tab-block")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-tab-style")).toBeVisible();

    await expect(
      page.getByTestId("plumix-editor-mobile-blocks-trigger"),
    ).toHaveCount(0);
    await expect(
      page.getByTestId("plumix-editor-mobile-inspector-trigger"),
    ).toHaveCount(0);
  });

  test("mobile chrome collapses both sidebars into floating sheet triggers", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto("v2/entries/posts/1/edit");

    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expect(page.getByTestId("plumix-editor-canvas")).toBeVisible();

    await expect(page.getByTestId("plumix-editor-left")).toHaveCount(0);
    await expect(page.getByTestId("plumix-editor-right")).toHaveCount(0);

    await expect(
      page.getByTestId("plumix-editor-mobile-blocks-trigger"),
    ).toBeVisible();
    await expect(
      page.getByTestId("plumix-editor-mobile-inspector-trigger"),
    ).toBeVisible();
  });

  test("slash menu opens on the canvas when '/' is pressed", async ({
    page,
  }) => {
    await page.goto("v2/entries/posts/1/edit");

    const canvas = page.getByTestId("plumix-editor-canvas");
    await canvas.focus();
    await page.keyboard.press("/");

    await expect(page.getByTestId("slash-menu-dialog")).toBeVisible();
  });

  test("slash menu insert: selecting a paragraph adds it to the canvas", async ({
    page,
  }) => {
    await page.goto("v2/entries/posts/1/edit");

    const canvas = page.getByTestId("plumix-editor-canvas");
    await canvas.focus();
    await page.keyboard.press("/");

    await expect(page.getByTestId("slash-menu-dialog")).toBeVisible();
    await page.getByTestId("slash-menu-item-core/paragraph").click();

    await expect(page.getByTestId("slash-menu-dialog")).toBeHidden();
    await expect(canvas.locator("p")).toHaveCount(1);
  });

  test("server-loaded plumix.v2 content renders in the canvas on initial mount", async ({
    page,
  }) => {
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/entry/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              ...emptyEntry(1),
              content: {
                version: "plumix.v2",
                blocks: [
                  {
                    id: "h1",
                    name: "core/heading",
                    attrs: { level: 2, text: "Hello from server" },
                  },
                ],
              },
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("v2/entries/posts/1/edit");

    const canvas = page.getByTestId("plumix-editor-canvas");
    await expect(canvas.locator("h2")).toHaveText("Hello from server");
  });

  test("server-loaded wrapper block renders its nested children in the canvas", async ({
    page,
  }) => {
    await page.route("**/_plumix/rpc/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/entry/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              ...emptyEntry(1),
              content: {
                version: "plumix.v2",
                blocks: [
                  {
                    id: "g1",
                    name: "core/group",
                    attrs: {
                      content: [
                        {
                          id: "child-h",
                          name: "core/heading",
                          attrs: { level: 3, text: "Inside group" },
                        },
                      ],
                    },
                  },
                ],
              },
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("v2/entries/posts/1/edit");

    const canvas = page.getByTestId("plumix-editor-canvas");
    await expect(canvas.locator("h3")).toHaveText("Inside group");
  });

  test("v2 editor chrome has no WCAG 2.1 AA violations from axe-core", async ({
    page,
  }) => {
    await page.goto("v2/entries/posts/1/edit");
    await expect(page.getByTestId("plumix-editor-layout")).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("mobile inspector sheet has no WCAG 2.1 AA violations when open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.goto("v2/entries/posts/1/edit");

    await page
      .getByTestId("plumix-editor-mobile-inspector-trigger")
      .click();
    await expect(page.getByTestId("plumix-editor-tab-block")).toBeVisible();

    await expectNoAxeViolations(page);
  });

  test("autosave pill cycles saved → saving → saved when a block is inserted", async ({
    page,
  }) => {
    await page.route("**/_plumix/rpc/**", (route) => {
      if (route.request().url().endsWith("/entry/update")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: { ...emptyEntry(1), updatedAt: T0 },
            meta: [],
          }),
        });
      }
      return route.fallback();
    });
    await page.goto("v2/entries/posts/1/edit");

    const pill = page.getByTestId("plumix-autosave-pill");
    await expect(pill).toHaveAttribute("data-status", "saved");

    await page.getByTestId("plumix-editor-canvas").focus();
    await page.keyboard.press("/");
    await page.getByTestId("slash-menu-item-core/paragraph").click();

    await expect(pill).toHaveAttribute("data-status", "saving");
    await expect(pill).toHaveAttribute("data-status", "saved");
  });

  test("autosave POSTs a plumix.v2 envelope to entry.update after a block is inserted", async ({
    page,
  }) => {
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: { ...emptyEntry(1), updatedAt: T0 },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": emptyEntry(1),
      },
    });
    await page.goto("v2/entries/posts/1/edit");

    await page.getByTestId("plumix-editor-canvas").focus();
    await page.keyboard.press("/");
    await page.getByTestId("slash-menu-item-core/paragraph").click();

    await expect
      .poll(
        () =>
          (
            captures.at(-1) as
              | { content?: { version?: string } }
              | undefined
          )?.content?.version ?? null,
      )
      .toBe("plumix.v2");
    const lastInput = captures.at(-1) as {
      readonly id: number;
      readonly content: { readonly blocks: unknown[] };
      readonly expectedLiveUpdatedAt: string;
    };
    expect(lastInput.id).toBe(1);
    expect(lastInput.content.blocks.length).toBeGreaterThan(0);
    expect(lastInput.expectedLiveUpdatedAt).toBe(T0.toISOString());
  });

  test("clicking the Publish button POSTs entry.update with status: published", async ({
    page,
  }) => {
    const captures = await mockRpcWithCapture(page, {
      captureSuffix: "/entry/update",
      captureResponse: {
        ...emptyEntry(1),
        status: "published",
        publishedAt: T0,
        updatedAt: T0,
      },
      handlers: {
        "/auth/session": AUTHED_ADMIN,
        "/entry/get": emptyEntry(1),
      },
    });
    await page.goto("v2/entries/posts/1/edit");

    const button = page.getByTestId("plumix-editor-publish-button");
    await expect(button).toBeEnabled();
    await button.click();

    await expect
      .poll(
        () =>
          (captures.at(-1) as { status?: string } | undefined)?.status ?? null,
      )
      .toBe("published");
    const lastInput = captures.at(-1) as {
      readonly id: number;
      readonly status: string;
      readonly content?: unknown;
      readonly expectedLiveUpdatedAt: string;
    };
    expect(lastInput.id).toBe(1);
    expect(lastInput.content).toBeUndefined();
    expect(lastInput.expectedLiveUpdatedAt).toBe(T0.toISOString());
  });

  test("Publish button is disabled when the entry is already published", async ({
    page,
  }) => {
    await page.route("**/_plumix/rpc/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/entry/get")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: { ...emptyEntry(1), status: "published", publishedAt: T0 },
            meta: [],
          }),
        });
      }
      return route.fallback();
    });
    await page.goto("v2/entries/posts/1/edit");

    await expect(page.getByTestId("plumix-editor-publish-button")).toBeDisabled();
  });

  test("publishing refetches entry.get so the button reflects the new status", async ({
    page,
  }) => {
    let entryGetCalls = 0;
    await page.route("**/_plumix/rpc/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/auth/session")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: rpcOkBody(AUTHED_ADMIN),
        });
      }
      if (url.endsWith("/entry/get")) {
        entryGetCalls += 1;
        const status = entryGetCalls === 1 ? "draft" : "published";
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: {
              ...emptyEntry(1),
              status,
              publishedAt: status === "published" ? T0 : null,
            },
            meta: [],
          }),
        });
      }
      if (url.endsWith("/entry/update")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            json: { ...emptyEntry(1), status: "published", publishedAt: T0 },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("v2/entries/posts/1/edit");

    const button = page.getByTestId("plumix-editor-publish-button");
    await expect(button).toBeEnabled();
    await button.click();
    await expect.poll(() => entryGetCalls).toBeGreaterThan(1);
    await expect(button).toBeDisabled();
  });

  test("autosave pill flips to error when entry.update rejects", async ({
    page,
  }) => {
    await page.route("**/_plumix/rpc/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/entry/update")) {
        return route.fulfill({
          status: 500,
          contentType: "application/json",
          body: rpcErrorBody({
            code: "INTERNAL_SERVER_ERROR",
            message: "boom",
          }),
        });
      }
      return route.fallback();
    });
    await page.goto("v2/entries/posts/1/edit");

    const pill = page.getByTestId("plumix-autosave-pill");
    await expect(pill).toHaveAttribute("data-status", "saved");

    await page.getByTestId("plumix-editor-canvas").focus();
    await page.keyboard.press("/");
    await page.getByTestId("slash-menu-item-core/paragraph").click();

    await expect(pill).toHaveAttribute("data-status", "error");
  });
});
