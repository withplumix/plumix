import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  rpcOkBody,
} from "./support/rpc-mock.js";

// Touch long-press wiring lives in unit + integration tests
// (`long-press.test.ts`, `long-press-extension.test.ts`). This spec
// confirms the production editor exposes the same contract end-to-end
// against the real React tree under a 480px viewport with `hasTouch`.
// We listen on the editor's view.dom for the BLOCK_MENU_OPEN_EVENT the
// extension dispatches; rendering the BlockMenu popover at this width
// has its own anchoring story tracked separately.

const T0 = new Date("2026-05-18T00:00:00Z");

test.describe("Touch long-press dispatches the BlockMenu open event (#314)", () => {
  test.use({ viewport: { width: 480, height: 800 }, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  test("touchstart held for >500ms fires plumix:block-menu-open", async ({
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
              id: 33,
              type: "post",
              parentId: null,
              title: "Touch",
              slug: "t",
              content: {
                type: "doc",
                content: [
                  {
                    type: "core/heading",
                    attrs: { level: 2 },
                    content: [{ type: "text", text: "Title" }],
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

    await page.goto("entries/posts/33/edit");
    await expect(page.getByTestId("post-editor-form")).toBeVisible();

    // Place the caret inside the heading so the command resolves
    // a non-null pos when long-press triggers it.
    await page.locator(".ProseMirror h2").click();

    // Install a sentinel on view.dom, then synthesise a held touch
    // (Playwright's touchscreen lacks a "hold" primitive). The
    // attachLongPressHandler timer fires after 500ms regardless of
    // touchend.
    const captured = await page.evaluate(
      async () =>
        new Promise<number>((resolve) => {
          const dom = document.querySelector<HTMLElement>(".ProseMirror");
          if (!dom) throw new Error(".ProseMirror not found");
          const onOpen = (e: Event): void => {
            const detail = (e as CustomEvent<{ pos: number }>).detail;
            resolve(detail.pos);
          };
          dom.addEventListener("plumix:block-menu-open", onOpen, {
            once: true,
          });
          const rect = dom.getBoundingClientRect();
          const event = new Event("touchstart", { bubbles: true });
          Object.defineProperty(event, "touches", {
            value: [{ clientX: rect.left + 20, clientY: rect.top + 20 }],
          });
          dom.dispatchEvent(event);
        }),
    );

    // pos=0 is the heading's containing position — proves the command
    // resolved the caret-block and dispatched the open event.
    expect(captured).toBe(0);
  });
});
