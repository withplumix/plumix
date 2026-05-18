import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  rpcOkBody,
} from "./support/rpc-mock.js";

// Regression for the Inspector "Supports" panel surfaced 2026-05-18:
// typing into the padding / margin / color fields silently no-op'd
// because block schemas didn't declare `style` as an attribute, so
// `updateAttributes({ style })` had nowhere to land and the canvas
// never reflected the author's input. `spec-extensions` now adds a
// structured `style` attribute on every block that opts into
// `supports`, with a `renderHTML` that resolves the slot to a CSS
// string + utility class.

const T0 = new Date("2026-05-18T00:00:00Z");

test.describe("Inspector Supports fields persist and reflect in the canvas", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  test("padding=20px writes to attrs.style and renders inline on the heading", async ({
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
              id: 99,
              type: "post",
              parentId: null,
              title: "Probe",
              slug: "p",
              content: {
                type: "doc",
                content: [
                  {
                    type: "core/heading",
                    attrs: { level: 2 },
                    content: [{ type: "text", text: "Section" }],
                  },
                ],
              },
              excerpt: null,
              status: "draft",
              authorId: 1,
              sortOrder: 0,
              publishedAt: null,
              createdAt: T0,
              updatedAt: T0,
              meta: {},
            },
            meta: [],
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts/99/edit");
    await expect(page.getByTestId("post-editor-form")).toBeVisible();
    await page.locator(".ProseMirror h2").click();

    const padding = page.getByTestId("inspector-supports-spacing.padding");
    await expect(padding).toBeVisible();
    await padding.fill("20px");

    // Input persists what the author typed.
    await expect(padding).toHaveValue("20px");

    // The canvas heading reflects the inline style — proves the
    // schema accepted the attribute and renderHTML rendered it.
    const h2Style = await page.evaluate(() => {
      const h2 = document.querySelector(".ProseMirror h2");
      return h2?.getAttribute("style") ?? null;
    });
    expect(h2Style).toContain("padding: 20px");
  });
});
