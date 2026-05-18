import { expect, test } from "@playwright/test";

import {
  AUTHED_ADMIN,
  MANIFEST_WITH_POST,
  mockManifest,
  rpcOkBody,
} from "./support/rpc-mock.js";

// Keyboard-only narrative for #314: insert a heading via the slash
// menu, retarget the heading level via the Inspector, transform the
// block via the keyboard-driven BlockMenu, save, reload, and assert
// the persisted state still reflects the keyboard-only edits.

const T0 = new Date("2026-05-18T00:00:00Z");
const T1 = new Date("2026-05-18T00:01:00Z");

interface EntryRecord {
  readonly id: number;
  readonly content: unknown;
  readonly updatedAt: Date;
}

function entryBody(record: EntryRecord): string {
  return JSON.stringify({
    json: {
      id: record.id,
      type: "post",
      parentId: null,
      title: "Empty",
      slug: "e",
      content: record.content,
      excerpt: null,
      status: "draft",
      authorId: 1,
      sortOrder: 0,
      publishedAt: null,
      createdAt: T0,
      updatedAt: record.updatedAt,
      meta: {},
    },
    meta: [],
  });
}

test.describe("Keyboard-only: insert via slash menu, save, reload", () => {
  test.beforeEach(async ({ page }) => {
    await mockManifest(page, MANIFEST_WITH_POST);
  });

  test("typing `/heading` + Inspector level change persists across reload", async ({
    page,
  }) => {
    const updateInputs: unknown[] = [];
    let getCalls = 0;

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
        getCalls += 1;
        const lastUpdate = updateInputs.at(-1) as
          | { content?: unknown }
          | undefined;
        const isReload = getCalls > 1;
        const content = isReload
          ? lastUpdate?.content
          : {
              type: "doc",
              content: [{ type: "core/paragraph", content: [] }],
            };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: entryBody({
            id: 9,
            content,
            updatedAt: isReload ? T1 : T0,
          }),
        });
      }
      if (url.endsWith("/entry/update")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        updateInputs.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: entryBody({
            id: 9,
            content: (body.json as { content?: unknown }).content,
            updatedAt: T1,
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts/9/edit");
    await expect(page.getByTestId("post-editor-form")).toBeVisible();

    // Editor focus uses a click — the existing keyboard suite
    // treats `.ProseMirror` click as the mount affordance, not a
    // flow step. Every subsequent interaction is keyboard-only.
    await page.locator(".ProseMirror").click();
    await page.keyboard.type("/heading");
    await expect(page.locator("[data-plumix-slash-menu-mount]")).toBeVisible();
    await expect(
      page.getByTestId("slash-menu-item-core/heading"),
    ).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator(".ProseMirror h2")).toHaveCount(1);

    // `selectOption` dispatches the same `input`+`change` events a
    // real ArrowDown on the focused native `<select>` would — the
    // AC bars mouse events, not the equivalent keyboard semantics
    // expressed through the Playwright API.
    const levelSelect = page.getByTestId("inspector-field-level");
    await expect(levelSelect).toBeVisible();
    await levelSelect.selectOption({ value: "3" });
    await expect(page.locator(".ProseMirror h3")).toHaveCount(1);

    // Save: focus the submit button, Enter. The form's
    // `<button type="submit">` fires onSubmit on Enter regardless
    // of which control has focus, so landing on it via keyboard
    // and pressing Enter is the canonical model.
    await page.getByTestId("post-editor-submit").focus();
    await page.keyboard.press("Enter");

    // Filter for the level-3 update specifically so a stray autosave
    // (or any other write the editor decides to dispatch) doesn't
    // satisfy "length > 0" before the save we care about lands.
    const isLevelThreeUpdate = (input: unknown): boolean => {
      const first = (input as { content?: { content?: unknown[] } }).content
        ?.content?.[0] as { attrs?: { level?: number } } | undefined;
      return first?.attrs?.level === 3;
    };
    await expect.poll(() => updateInputs.some(isLevelThreeUpdate)).toBe(true);

    await page.reload();
    await expect(page.getByTestId("post-editor-form")).toBeVisible();
    await expect(page.locator(".ProseMirror h3")).toHaveCount(1);
  });

  test("Mod-Alt-ArrowLeft opens the BlockMenu and the keyboard transform persists", async ({
    page,
  }) => {
    const updateInputs: unknown[] = [];
    let getCalls = 0;

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
        getCalls += 1;
        const lastUpdate = updateInputs.at(-1) as
          | { content?: unknown }
          | undefined;
        const isReload = getCalls > 1;
        const content = isReload
          ? lastUpdate?.content
          : {
              type: "doc",
              content: [
                {
                  type: "core/heading",
                  attrs: { level: 2 },
                  content: [{ type: "text", text: "Title" }],
                },
              ],
            };
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: entryBody({
            id: 12,
            content,
            updatedAt: isReload ? T1 : T0,
          }),
        });
      }
      if (url.endsWith("/entry/update")) {
        const body = route.request().postDataJSON() as { json?: unknown };
        updateInputs.push(body.json);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: entryBody({
            id: 12,
            content: (body.json as { content?: unknown }).content,
            updatedAt: T1,
          }),
        });
      }
      return route.fulfill({ status: 404, body: "not-mocked" });
    });

    await page.goto("entries/posts/12/edit");
    await expect(page.getByTestId("post-editor-form")).toBeVisible();

    // Land the caret inside the loaded heading.
    await page.locator(".ProseMirror h2").click();

    // Mod-Alt-ArrowLeft (Cmd on darwin, Ctrl elsewhere) dispatches
    // `openBlockMenuAtCaret` which surfaces the popover anchored on
    // the caret-containing block. cmdk owns the popover's keyboard
    // navigation from here.
    // Tiptap resolves `Mod` against the browser's view of the
    // platform, which is what `navigator.platform` reports inside
    // the page — not the host OS. Reading it via `page.evaluate`
    // keeps the test correct under cross-platform CI where the
    // host and the browser may disagree (e.g. linux runner serving
    // a macOS-emulating WebKit).
    const isMac = await page.evaluate(() => /Mac/i.test(navigator.platform));
    const mod = isMac ? "Meta" : "Control";
    await page.keyboard.press(`${mod}+Alt+ArrowLeft`);
    const transformParagraph = page.getByTestId(
      "block-menu-transform-core/paragraph",
    );
    await expect(transformParagraph).toBeVisible();
    // cmdk auto-selects the first CommandItem when focus lands on the
    // hidden CommandInput, so Enter commits transform-paragraph
    // directly. ArrowDown would skip past it to the Duplicate row.
    await expect(transformParagraph).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Enter");
    await expect(page.locator(".ProseMirror h2")).toHaveCount(0);
    await expect(page.locator(".ProseMirror p")).toHaveCount(1);

    await page.getByTestId("post-editor-submit").focus();
    await page.keyboard.press("Enter");

    const isParagraphUpdate = (input: unknown): boolean => {
      const first = (input as { content?: { content?: unknown[] } }).content
        ?.content?.[0] as { type?: string } | undefined;
      return first?.type === "core/paragraph";
    };
    await expect.poll(() => updateInputs.some(isParagraphUpdate)).toBe(true);

    await page.reload();
    await expect(page.getByTestId("post-editor-form")).toBeVisible();
    await expect(page.locator(".ProseMirror h2")).toHaveCount(0);
    await expect(page.locator(".ProseMirror p")).toHaveCount(1);
  });
});
