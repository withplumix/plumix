// Shared fixtures + interaction helpers for editor-actions.spec.ts.
// The mock harness can't prove server persistence, so specs assert the
// two client contracts instead: what the canvas renders, and what
// envelope entry.update receives.

import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import { AUTHED_ADMIN, mockRpcWithCapture } from "./rpc-mock.js";

export const T0 = new Date("2026-05-20T00:00:00Z");

export interface EditorEntryOptions {
  readonly id?: number;
  readonly status?: "draft" | "published";
  readonly content?: unknown;
  readonly title?: string;
}

export function editorEntry(
  options: EditorEntryOptions = {},
): Record<string, unknown> {
  const id = options.id ?? 1;
  const status = options.status ?? "draft";
  return {
    id,
    type: "post",
    parentId: null,
    title: options.title ?? "Untitled",
    slug: `entry-${String(id)}`,
    content: options.content ?? null,
    excerpt: null,
    status,
    authorId: 1,
    sortOrder: 0,
    publishedAt: status === "published" ? T0 : null,
    createdAt: T0,
    updatedAt: T0,
    meta: {},
  };
}

// Two visible blocks (heading text + rich-text body) so drag, select,
// duplicate, and delete specs start from a canvas with real geometry —
// empty blocks render zero-height and can't be clicked.
export const SEEDED_CONTENT = {
  version: "plumix.v2",
  blocks: [
    {
      id: "b1",
      name: "core/heading",
      attrs: { level: 2, text: "Seeded heading" },
    },
    {
      id: "b2",
      name: "core/rich-text",
      attrs: { body: "<p>Seeded body</p>" },
    },
  ],
};

export interface InstallEditorMocksOptions {
  readonly entry?: Record<string, unknown>;
  /** Extra suffix → body handlers, overriding the defaults on collision. */
  readonly handlers?: Readonly<Record<string, unknown>>;
}

/**
 * Standard editor route mocks: session, entry/get, activity (empty),
 * list (empty), and a captured entry/update echoing the entry back.
 * Returns the captured update envelopes for contract assertions.
 */
export function installEditorMocks(
  page: Page,
  options: InstallEditorMocksOptions = {},
): Promise<readonly unknown[]> {
  const entry = options.entry ?? editorEntry();
  return mockRpcWithCapture(page, {
    captureSuffix: "/entry/update",
    captureResponse: entry,
    handlers: {
      "/auth/session": AUTHED_ADMIN,
      "/entry/get": entry,
      "/entry/activity/list": { users: [] },
      "/entry/list": [],
      ...options.handlers,
    },
  });
}

// The starter modal opens whenever the manifest carries a starter-
// eligible pattern and the entry content is empty. Specs that aren't
// about the modal start blank.
export async function dismissStarterModal(page: Page): Promise<void> {
  const modal = page.getByTestId("plumix-starter-modal");
  await modal.waitFor({ state: "visible" });
  await page.getByTestId("plumix-starter-modal-start-blank").click();
  await expect(modal).toBeHidden();
}

// Puck exposes only the item id on `data-puck-component` (pattern
// inserts mint bare random ids), so block type is asserted through the
// semantic element each core block renders — which doubles as checking
// the block actually renders its markup.
const BLOCK_DOM: Record<string, string> = {
  "core/heading": "h1, h2, h3, h4, h5, h6",
  "core/rich-text": ".rich-text",
  "core/quote": "blockquote",
  "core/separator": "hr",
};

/** Canvas-rendered block wrappers for a given block name. */
export function canvasBlocks(page: Page, name: string): Locator {
  const selector = BLOCK_DOM[name];
  if (!selector) throw new Error(`canvasBlocks: no DOM mapping for ${name}`);
  return page
    .getByTestId("plumix-editor-canvas")
    .locator("[data-puck-component]")
    .filter({ has: page.locator(selector) });
}

/** Top-level canvas block order as semantic names, for reorder asserts. */
export async function canvasOrder(page: Page): Promise<readonly string[]> {
  return page
    .getByTestId("plumix-editor-canvas")
    .locator("[data-puck-component]")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        if (node.querySelector("h1, h2, h3, h4, h5, h6")) return "heading";
        if (node.querySelector(".rich-text")) return "rich-text";
        if (node.querySelector("blockquote")) return "quote";
        if (node.querySelector("hr")) return "separator";
        return "unknown";
      }),
    );
}

/**
 * Reorder drag for Puck's canvas (@dnd-kit/react, mouse sensor with a
 * 5 px distance activation). HTML5 dragTo() doesn't fire pointer
 * events, so this walks the cursor: down on the source, a short
 * vertical move to clear the activation distance, a settle pause for
 * the drag to engage, a stepped glide deep past the target's bottom
 * edge (near-edge drops resolve back to the source's original slot — a
 * silent no-op — while the collision detector clamps an overshoot to
 * "after the last item"), another settle, then up. Meant for dropping
 * after the zone's trailing block.
 */
export async function dragBelow(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) {
    throw new Error("dragBelow: source or target has no bounding box");
  }
  const x = sourceBox.x + Math.min(40, sourceBox.width / 2);
  const startY = sourceBox.y + sourceBox.height / 2;
  await page.mouse.move(x, startY);
  await page.mouse.down();
  await page.mouse.move(x, startY + 10, { steps: 4 });
  await page.waitForTimeout(300);
  await page.mouse.move(x, targetBox.y + targetBox.height + 100, {
    steps: 12,
  });
  await page.waitForTimeout(300);
  await page.mouse.up();
}

/** Last captured entry.update envelope, typed for content asserts. */
export function lastUpdate(updates: readonly unknown[]):
  | {
      readonly title?: string;
      readonly content?: {
        readonly version?: string;
        readonly blocks?: readonly {
          readonly name?: string;
          readonly attrs?: Readonly<Record<string, unknown>>;
        }[];
      };
    }
  | undefined {
  return updates.at(-1) as ReturnType<typeof lastUpdate>;
}
