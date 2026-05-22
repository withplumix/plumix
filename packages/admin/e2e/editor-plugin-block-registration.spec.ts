// Guardrail e2e for #472 slice 3 — proves a plugin block registered
// via `window.plumix.registerPluginBlock(spec)` at chunk-evaluation
// time reaches the editor's runtime registry and surfaces in the
// inserter + slash menu. Simulates the plugin-chunk side effect
// without needing a multi-plugin playground: an `addInitScript` traps
// the first assignment to `window.plumix` (by `bootPlumixGlobals`)
// and immediately registers a stub block against the just-installed
// bridge.

import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  rpcOkBody,
} from "./support/rpc-mock.js";

const T0 = new Date("2026-05-22T00:00:00Z");

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

test.describe("plugin block registered via window.plumix bridge", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
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
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ json: emptyEntry(1), meta: [] }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });
  });

  test("a block registered at chunk-eval time surfaces in the inserter + slash menu", async ({
    page,
  }) => {
    // Trap the first `window.plumix = ...` assignment (done by
    // `bootPlumixGlobals` early in main.tsx). At that moment the bridge
    // is live but no plugin chunks have run yet — perfect proxy for
    // what a real `<script data-plumix-plugin>` would do once its
    // module evaluates.
    await page.addInitScript(() => {
      let trapped: unknown;
      Object.defineProperty(window, "plumix", {
        configurable: true,
        get() {
          return trapped;
        },
        set(value: {
          registerPluginBlock?: (spec: Record<string, unknown>) => void;
        }) {
          trapped = value;
          value.registerPluginBlock?.({
            name: "test/fake",
            title: "Fake test block",
            icon: "Code",
            category: "text",
            inputs: [],
            defaults: {},
            render: () => null,
          });
        },
      });
    });

    await page.goto("entries/posts/1/edit");

    // The block is wired in two places — the inserter sidebar list and
    // the slash menu. Asserting both proves the runtime registry feeds
    // every consumer that the hardcoded `coreBlocks` import used to.
    await expect(
      page.getByTestId("plumix-blocks-tab-item-test/fake"),
    ).toBeVisible();

    const canvas = page.getByTestId("plumix-editor-canvas");
    await canvas.focus();
    await page.keyboard.press("/");
    await page.keyboard.type("fake");
    await expect(page.getByTestId("slash-menu-item-test/fake")).toBeVisible();
  });
});
