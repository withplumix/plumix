import type { FrameLocator, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

import type { BlockNode } from "../../blocks/render-block-tree.js";
import { readManifestScript } from "../../plugin/manifest-script.js";
import { dragTo } from "./drag-to.js";

const ADMIN_PATH = "/_plumix/admin/";
const ENTRY_GET_PATH = "/_plumix/rpc/entry/get";
const REVISIONS_LIST_PATH = "/_plumix/rpc/entry/revisions/list";

/** An entry to open: a row from `openPlaygroundDb`, or its type and id. */
export interface EditorEntryRef {
  readonly type: string;
  readonly id: number;
}

/** A revision of the open entry, such as a row from the `revision` factory. */
export interface EditorRevisionRef {
  readonly id: number;
}

/** The canvas iframe, where the entry's blocks render. */
export interface EditorCanvas {
  /** The canvas iframe itself, for what the methods here don't cover. */
  readonly frame: FrameLocator;
  /** The `index`th block named `name` in document order, nested ones included. */
  block: (name: string, index?: number) => Locator;
  /** The names of the top-level blocks, in order. */
  blocks: () => Promise<readonly string[]>;
  /**
   * Selects `block` and clicks it, so the keys pressed next start in the
   * canvas iframe rather than the editor around it.
   */
  focus: (block: Locator) => Promise<void>;
}

/**
 * Where `insert` puts the block: the top level's `"start"` or `"end"`, beside
 * a block, or at the end of one of its slots (its only slot when `slot` is
 * omitted).
 */
export type EditorInsertAt =
  | "start"
  | "end"
  | { readonly after: Locator }
  | { readonly before: Locator }
  | { readonly into: Locator; readonly slot?: string };

export interface EditorInsertOptions {
  /** `"end"` by default. */
  readonly at?: EditorInsertAt;
  /**
   * `"click"` by default. A click lands beside the selection's top-level
   * block, so it nests only through an empty slot's appender.
   */
  readonly via?: "click" | "drag";
}

/** The floating toolbar over the selected block. */
export interface EditorToolbar {
  moveUp: () => Promise<void>;
  moveDown: () => Promise<void>;
  selectParent: () => Promise<void>;
  remove: () => Promise<void>;
}

/**
 * Text, a number, a checkbox's boolean, or a choice's option value. A media
 * picker takes a media id and reads back its file name.
 */
export type EditorInputValue = string | number | boolean | null;

/**
 * A button that reshapes the selected block: a columns block's `add-column`,
 * or a table's rows and columns, from the table or any block inside it.
 */
export type EditorStructureButton =
  | "add-column"
  | "add-table-row"
  | "add-table-column"
  | "remove-table-row"
  | "remove-table-column";

/**
 * The selected block's settings. `field` is the input's `name` as the block
 * declares it, the key its value is stored under.
 */
export interface EditorInspector {
  set: (field: string, value: EditorInputValue) => Promise<void>;
  get: (field: string) => Promise<EditorInputValue>;
  press: (button: EditorStructureButton) => Promise<void>;
}

export type EditorTextFormat =
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "code"
  | "highlight"
  | "subscript"
  | "superscript"
  | "paragraph"
  | `heading-${1 | 2 | 3 | 4 | 5 | 6}`
  | "bullet-list"
  | "ordered-list"
  | "quote";

/**
 * A text block's rich text, edited in the inspector. Marks and links apply to
 * the whole text; a heading level, list or quote to its first paragraph.
 */
export interface EditorRichText {
  /** Types `text` over the block's text, replacing it. */
  type: (text: string) => Promise<void>;
  /** Selects the whole text in its field, so the keys pressed next act on it. */
  select: () => Promise<void>;
  /** Toggles a mark, a list or a quote, or sets the paragraph or heading level. */
  format: (format: EditorTextFormat) => Promise<void>;
  link: (url: string) => Promise<void>;
  unlink: () => Promise<void>;
}

/** The open entry's document settings, as the server stores them. */
export interface EditorStoredDocument {
  readonly title: string;
  /** The meta bag, the reserved `__plumix_*` keys (visibility, template) included. */
  readonly meta: Readonly<Record<string, unknown>>;
  /** Term ids by taxonomy. */
  readonly terms: Readonly<Record<string, readonly number[]>>;
}

/** One of the open entry's revisions, as the server stores it. */
export interface EditorStoredRevision {
  readonly id: number;
  readonly title: string;
  /** The comment left on it, or `null`. */
  readonly message: string | null;
}

/**
 * Drives the real block editor. Every action waits on what the editor itself
 * shows, never on the clock.
 */
export interface Editor {
  open: (entry: EditorEntryRef) => Promise<void>;
  create: (type: string) => Promise<void>;
  readonly canvas: EditorCanvas;
  /** Inserts block `name` from the catalog and returns it in the canvas. */
  insert: (name: string, options?: EditorInsertOptions) => Promise<Locator>;
  select: (block: Locator) => Promise<void>;
  readonly toolbar: EditorToolbar;
  readonly inspector: EditorInspector;
  /** Undoes the last edit with the header's Undo button. */
  undo: () => Promise<void>;
  /** Redoes the last undone edit with the header's Redo button. */
  redo: () => Promise<void>;
  /** Edits a text block's rich text. */
  richText: (block: Locator) => EditorRichText;
  /** Resolves once every edit so far, and any publish, has reached the server. */
  save: () => Promise<void>;
  /** Publishes the entry, or a published entry's pending edits. */
  publish: () => Promise<void>;
  /** Leaves with the header's Back button, once the editor has closed. */
  back: () => Promise<void>;
  /**
   * Discards a published entry's pending edits and resolves once the editor
   * has reopened on the published state.
   */
  discard: () => Promise<void>;
  /**
   * Previews `revision` from the Revisions sheet and restores it, resolving
   * once the editor has reopened on the restored state.
   */
  restoreRevision: (revision: EditorRevisionRef) => Promise<void>;
  reload: () => Promise<void>;
  /**
   * The open entry's block tree as the server stores it, read the way the
   * editor loads it: a published entry's pending edits included.
   */
  stored: () => Promise<readonly BlockNode[]>;
  /** The open entry's title, meta and terms, read the way `stored` reads its blocks. */
  storedDocument: () => Promise<EditorStoredDocument>;
  /** Every one of the open entry's revisions, newest first. */
  storedRevisions: () => Promise<readonly EditorStoredRevision[]>;
}

/** The parts of `entry.get`'s answer the fixture reads. */
interface StoredEntryBody extends EditorStoredDocument {
  readonly content: { readonly blocks?: readonly BlockNode[] } | null;
}

interface StoredRevisionPage {
  readonly revisions: readonly EditorStoredRevision[];
  readonly nextCursor: string | null;
}

const BLOCK = "[data-plumix-id]";

const attr = (name: string, value: string): string =>
  `[${name}=${JSON.stringify(value)}]`;

interface Box {
  readonly width: number;
  readonly height: number;
}

/**
 * Just inside a block's edge, where a drop lands beside it rather than in a
 * slot; a quarter of the height at most, for a scaled-down separator.
 */
const edgeInset = (box: Box): number => Math.min(1, box.height / 4);
const TOP_EDGE = (box: Box): { x: number; y: number } => ({
  x: box.width / 2,
  y: edgeInset(box),
});
const BOTTOM_EDGE = (box: Box): { x: number; y: number } => ({
  x: box.width / 2,
  y: box.height - edgeInset(box),
});

const MARKS: ReadonlySet<EditorTextFormat> = new Set([
  "bold",
  "italic",
  "underline",
  "strike",
  "code",
  "highlight",
  "subscript",
  "superscript",
]);

const isNested = (block: Locator): Promise<boolean> =>
  block.evaluate(
    (el, selector) => el.parentElement?.closest(selector) != null,
    BLOCK,
  );

type ControlKind = "text" | "number" | "toggle" | "choice" | "radio" | "media";

/** Which control the inspector rendered for an input, read off its element. */
async function controlKind(
  control: Locator,
  testId: string,
): Promise<ControlKind> {
  const { tag, role, type } = await control.evaluate((el) => ({
    tag: el.tagName,
    role: el.getAttribute("role"),
    type: el.getAttribute("type"),
  }));
  if (tag === "INPUT") return type === "number" ? "number" : "text";
  if (tag === "TEXTAREA") return "text";
  if (role === "checkbox" || role === "switch") return "toggle";
  if (role === "combobox") return "choice";
  if (role === "radiogroup") return "radio";
  if ((await control.getByTestId(`${testId}-open`).count()) > 0) return "media";
  throw new Error(`editor.inspector: no control it can drive at "${testId}".`);
}

export function createEditor(page: Page): Editor {
  const iframe = page.getByTestId("plumix-canvas-iframe");
  const frame = iframe.contentFrame();
  const canvasRoot = frame.getByTestId("plumix-editor-canvas");
  const header = page.getByTestId("plumix-editor-header");
  let adminSlugs: Promise<ReadonlyMap<string, string>> | undefined;

  const adminSlug = async (type: string): Promise<string> => {
    adminSlugs ??= readAdminSlugs(page);
    const slug = (await adminSlugs).get(type);
    if (slug === undefined) {
      throw new Error(`editor: the site registers no entry type "${type}".`);
    }
    return slug;
  };

  // A dev server serves the canvas iframe's modules unbundled; under parallel
  // workers that outlasts an assertion's 5s, so it waits like a page load.
  const ready = async (): Promise<void> => {
    await expect(header).toHaveAttribute("data-save-state", "saved");
    await expect(canvasRoot).toBeAttached({ timeout: 0 });
    await expect(iframe).toHaveAttribute("data-canvas-state", "ready", {
      timeout: 0,
    });
  };

  // Discarding and restoring remount the editor, and the canvas iframe with
  // it, so the old one detaching is what tells the new one apart.
  const remounted = async (action: () => Promise<void>): Promise<void> => {
    const before = await iframe.elementHandle();
    await action();
    await expect
      .poll(() => before.evaluate((el) => el.isConnected))
      .toBe(false);
    await before.dispose();
    await ready();
  };

  const selected = page.getByTestId("plumix-overlay-selected");
  const blockById = (id: string): Locator =>
    canvasRoot.locator(attr("data-plumix-id", id));
  const blockIds = (): Promise<string[]> =>
    canvasRoot
      .locator(BLOCK)
      .evaluateAll((els) =>
        els.map((el) => el.getAttribute("data-plumix-id") ?? ""),
      );
  const idOf = async (block: Locator): Promise<string> => {
    const id = await block.evaluate(
      (el, selector) => el.closest(selector)?.getAttribute("data-plumix-id"),
      BLOCK,
    );
    if (!id) throw new Error("editor: that locator is not a canvas block.");
    return id;
  };
  const selectedId = async (): Promise<string> => {
    const id = await selected.getAttribute("data-block-id");
    if (!id) throw new Error("editor: no block is selected.");
    return id;
  };
  const topLevelBlocks = (): Promise<{ id: string; name: string }[]> =>
    canvasRoot.locator(BLOCK).evaluateAll(
      (els, selector) =>
        els
          .filter((el) => !el.parentElement?.closest(selector))
          .map((el) => ({
            id: el.getAttribute("data-plumix-id") ?? "",
            name: el.getAttribute("data-plumix-block") ?? "",
          })),
      BLOCK,
    );
  const topLevel = async (): Promise<Locator[]> =>
    (await topLevelBlocks()).map(({ id }) => blockById(id));

  // Through the Layers rail: a click in the canvas lands on whichever nested
  // block sits under the pointer.
  const select = async (block: Locator): Promise<void> => {
    const id = await idOf(block);
    await page.getByTestId("plumix-tab-layers").click();
    await page.getByTestId(`layer-${id}`).click();
    await expect(selected).toHaveAttribute("data-block-id", id);
  };

  const reorder = async (testId: string): Promise<void> => {
    const before = await blockIds();
    await page.getByTestId(testId).click();
    await expect.poll(blockIds).not.toEqual(before);
  };

  const toolbar: EditorToolbar = {
    moveUp: () => reorder("selection-toolbar-move-up"),
    moveDown: () => reorder("selection-toolbar-move-down"),
    selectParent: async () => {
      const id = await selectedId();
      await page.getByTestId("selection-toolbar-select-parent").click();
      await expect(selected).not.toHaveAttribute("data-block-id", id);
    },
    remove: async () => {
      const id = await selectedId();
      await page.getByTestId("selection-toolbar-delete").click();
      await expect(blockById(id)).toHaveCount(0);
    },
  };

  const catalogItem = async (name: string): Promise<Locator> => {
    await page.getByTestId("plumix-tab-blocks").click();
    return page
      .getByTestId("plumix-editor-left")
      .getByTestId(`block-catalog-item-${name}`);
  };

  const besideOf = async (
    at: Exclude<EditorInsertAt, { readonly into: Locator }>,
  ): Promise<{
    readonly block: Locator | undefined;
    readonly before: boolean;
  }> => {
    if (at === "start") return { block: (await topLevel())[0], before: true };
    if (at === "end")
      return { block: (await topLevel()).at(-1), before: false };
    return "after" in at
      ? { block: at.after, before: false }
      : { block: at.before, before: true };
  };

  const clickInsertNeedsMoveUp = async (
    name: string,
    at: EditorInsertAt,
  ): Promise<boolean> => {
    if (typeof at === "object" && "into" in at) {
      await clickIntoSlot(name, await idOf(at.into), at.slot);
      return false;
    }
    const { block, before } = await besideOf(at);
    if (block !== undefined && (await isNested(block))) {
      throw new Error(
        'editor.insert: a click lands beside the selection\'s top-level block; pass `via: "drag"` to insert beside a nested one.',
      );
    }
    if (block !== undefined) await select(block);
    await (await catalogItem(name)).click();
    return before && block !== undefined;
  };

  const clickIntoSlot = async (
    name: string,
    parentId: string,
    slot: string | undefined,
  ): Promise<void> => {
    const appender = canvasRoot
      .locator(
        attr("data-plumix-add-parent", parentId) +
          (slot === undefined ? "" : attr("data-plumix-add-slot", slot)),
      )
      .first();
    if ((await appender.count()) === 0) {
      throw new Error(
        'editor.insert: a click reaches only an empty slot; pass `via: "drag"` to add to one that has blocks.',
      );
    }
    const popover = page.getByTestId("plumix-inserter-popover");
    await appender.click();
    await expect(popover).toBeVisible();
    await popover.getByTestId(`block-catalog-item-${name}`).click();
    await expect(popover).toBeHidden();
  };

  const dragInsert = async (
    name: string,
    at: EditorInsertAt,
  ): Promise<void> => {
    const source = await catalogItem(name);
    if (typeof at === "object" && "into" in at) {
      const parentId = await idOf(at.into);
      const slot = canvasRoot
        .locator(
          attr("data-plumix-slot-parent", parentId) +
            (at.slot === undefined
              ? ""
              : attr("data-plumix-slot-key", at.slot)),
        )
        .first();
      const last = slot
        .locator(":scope > :is([data-plumix-id], [data-plumix-slot-empty])")
        .last();
      await dragTo(page, source, last, { targetPosition: BOTTOM_EDGE });
      return;
    }
    const { block, before } = await besideOf(at);
    if (block === undefined) {
      const appender = canvasRoot.locator(
        "[data-plumix-add]:not([data-plumix-add-parent])",
      );
      await dragTo(page, source, appender);
      return;
    }
    await dragTo(page, source, block, {
      targetPosition: before ? TOP_EDGE : BOTTOM_EDGE,
    });
  };

  const insert = async (
    name: string,
    { at = "end", via = "click" }: EditorInsertOptions = {},
  ): Promise<Locator> => {
    const before = new Set(await blockIds());
    let moveUp = false;
    if (via === "drag") await dragInsert(name, at);
    else moveUp = await clickInsertNeedsMoveUp(name, at);
    // The first new id in document order is the inserted block, ahead of any
    // children it was inserted with.
    let id: string | undefined;
    await expect
      .poll(async () => {
        id = (await blockIds()).find((candidate) => !before.has(candidate));
        return id;
      })
      .toBeDefined();
    if (id === undefined)
      throw new Error("editor.insert: nothing was inserted.");
    if (moveUp) {
      await expect(selected).toHaveAttribute("data-block-id", id);
      await toolbar.moveUp();
    }
    return blockById(id);
  };

  const blockInspector = async (): Promise<Locator> => {
    await page.getByTestId("plumix-tab-block").click();
    return page.getByTestId("block-inspector");
  };

  const inspectorControl = async (
    field: string,
  ): Promise<{ control: Locator; testId: string; kind: ControlKind }> => {
    const testId = `block-input-${field}`;
    const control = (await blockInspector()).getByTestId(testId);
    await expect(control).toBeVisible();
    return { control, testId, kind: await controlKind(control, testId) };
  };

  const radioOptions = (control: Locator, testId: string): Locator =>
    control.locator(`[data-testid^=${JSON.stringify(`${testId}-`)}]`);

  const inspector: EditorInspector = {
    set: async (field, value) => {
      const { control, testId, kind } = await inspectorControl(field);
      const text = value === null ? "" : String(value);
      switch (kind) {
        case "text":
        case "number":
          await control.fill(text);
          await expect(control).toHaveValue(text);
          return;
        case "toggle":
          if ((await control.getAttribute("aria-checked")) !== text) {
            await control.click();
          }
          await expect(control).toHaveAttribute("aria-checked", text);
          return;
        case "choice":
          await control.click();
          await page.getByTestId(`${testId}-option-${text}`).click();
          await expect(control).toHaveAttribute("data-value", text);
          return;
        case "radio":
          await control.getByTestId(`${testId}-${text}`).check();
          return;
        case "media": {
          if (value === null) {
            await control.getByTestId(`${testId}-clear`).click();
            await expect(control.getByTestId(`${testId}-empty`)).toBeVisible();
            return;
          }
          await control.getByTestId(`${testId}-open`).click();
          const modal = page.getByTestId(`${testId}-modal`);
          const card = modal.getByTestId(`media-card-${text}`);
          // The library pages in as its sentinel scrolls into view.
          await expect
            .poll(async () => {
              const paged = await card.count();
              if (paged === 0) {
                await modal
                  .getByTestId("media-library-sentinel")
                  .scrollIntoViewIfNeeded();
              }
              return paged;
            })
            .toBeGreaterThan(0);
          await card.click();
          await modal.getByTestId("media-library-picker-confirm").click();
          await expect(modal).toBeHidden();
          await expect(control.getByTestId(`${testId}-filename`)).toBeVisible();
          return;
        }
      }
    },
    // Every button adds or removes blocks, so the canvas's block ids change.
    press: async (button) => {
      const before = await blockIds();
      await (await blockInspector()).getByTestId(`inspector-${button}`).click();
      await expect.poll(blockIds).not.toEqual(before);
    },
    get: async (field) => {
      const { control, testId, kind } = await inspectorControl(field);
      switch (kind) {
        case "text":
          return control.inputValue();
        case "number": {
          const raw = await control.inputValue();
          return raw === "" ? null : Number(raw);
        }
        case "toggle":
          return (await control.getAttribute("aria-checked")) === "true";
        case "choice": {
          const value = await control.getAttribute("data-value");
          return value === null || value === "" ? null : value;
        }
        case "radio": {
          const checked = await radioOptions(control, testId).evaluateAll(
            (options) =>
              options
                .filter((option) => (option as HTMLInputElement).checked)
                .map((option) => option.getAttribute("data-testid") ?? ""),
          );
          return checked[0]?.slice(testId.length + 1) ?? null;
        }
        case "media": {
          const name = control.getByTestId(`${testId}-filename`);
          return (await name.count()) > 0 ? name.textContent() : null;
        }
      }
    },
  };

  const save = async (): Promise<void> => {
    await expect(header).toHaveAttribute("data-save-state", "saved");
  };

  const rpc = async <T>(
    caller: string,
    path: string,
    input: unknown,
  ): Promise<T> => {
    const response = await page.request.post(path, {
      headers: { "x-plumix-request": "1" },
      data: { json: input },
    });
    if (!response.ok()) {
      throw new Error(
        `editor.${caller}: ${path} answered ${String(response.status())}.`,
      );
    }
    return ((await response.json()) as { readonly json: T }).json;
  };
  const storedEntry = (caller: string): Promise<StoredEntryBody> =>
    rpc(caller, ENTRY_GET_PATH, { id: entryId(), preview: true });

  const entryId = (): number => {
    const id = /\/entries\/[^/]+\/(\d+)\/edit/.exec(page.url())?.[1];
    if (id === undefined) throw new Error("editor: no entry is open.");
    return Number(id);
  };

  const richText = (block: Locator): EditorRichText => {
    const selectText = async (
      range: "all" | "start" = "all",
    ): Promise<string> => {
      await select(block);
      await page.getByTestId("plumix-tab-block").click();
      const inspectorPanel = page.getByTestId("block-inspector");
      const surface = inspectorPanel
        .locator('[data-testid^="block-input-"][data-testid$="-editor"]')
        .first();
      // A click in the middle can land in a trailing empty paragraph, and
      // ProseMirror may sync that selection back over the key press below.
      await surface.focus();
      // A list or quote reports itself active from a caret inside it, not
      // from a selection of the whole document.
      await page.keyboard.press(
        range === "all" ? "ControlOrMeta+A" : "ControlOrMeta+Home",
      );
      const testId = await surface.getAttribute("data-testid");
      if (testId === null) throw new Error("editor.richText: no text field.");
      return testId.slice(0, -"-editor".length);
    };
    const toggle = async (control: Locator): Promise<void> => {
      const pressed = await control.getAttribute("aria-pressed");
      await control.click();
      await expect(control).not.toHaveAttribute("aria-pressed", pressed ?? "");
    };
    return {
      type: async (text) => {
        const testId = await selectText();
        await page.keyboard.type(text);
        await expect(page.getByTestId(`${testId}-editor`)).toHaveText(text);
        await expect(block).toContainText(text);
      },
      select: async () => {
        await selectText();
      },
      format: async (format) => {
        const isMark = MARKS.has(format);
        const testId = await selectText(isMark ? "all" : "start");
        const level = /^heading-(\d)$/.exec(format)?.[1];
        if (level !== undefined || format === "paragraph") {
          const option = page.getByTestId(
            `${testId}-format-${level === undefined ? "paragraph" : `h${level}`}`,
          );
          await page.getByTestId(`${testId}-format`).click();
          await option.click();
          await expect(option).toBeHidden();
          return;
        }
        await toggle(
          page.getByTestId(
            `${testId}-${format === "quote" ? "blockquote" : format}`,
          ),
        );
      },
      link: async (url) => {
        const testId = await selectText();
        await page.getByTestId(`${testId}-link`).click();
        await page.getByTestId(`${testId}-link-url`).fill(url);
        await page.getByTestId(`${testId}-link-apply`).click();
        await expect(page.getByTestId(`${testId}-link-form`)).toBeHidden();
        await expect(page.getByTestId(`${testId}-link`)).toHaveAttribute(
          "aria-pressed",
          "true",
        );
      },
      unlink: async () => {
        const testId = await selectText();
        await page.getByTestId(`${testId}-link`).click();
        await page.getByTestId(`${testId}-link-remove`).click();
        await expect(page.getByTestId(`${testId}-link-form`)).toBeHidden();
        await expect(page.getByTestId(`${testId}-link`)).toHaveAttribute(
          "aria-pressed",
          "false",
        );
      },
    };
  };

  const canvas: EditorCanvas = {
    frame,
    block: (name, index = 0) =>
      canvasRoot.locator(attr("data-plumix-block", name)).nth(index),
    blocks: async () => (await topLevelBlocks()).map(({ name }) => name),
    // Selected first: the selected block's toolbar floats over the block above
    // it, where the click would land instead.
    focus: async (block) => {
      await select(block);
      await block.click();
      await expect(iframe).toBeFocused();
    },
  };

  return {
    open: async ({ type, id }) => {
      await page.goto(`entries/${await adminSlug(type)}/${String(id)}/edit`);
      await ready();
    },
    create: async (type) => {
      await page.goto(`entries/${await adminSlug(type)}/create`);
      await page.waitForURL(/\/entries\/[^/]+\/\d+\/edit/);
      await ready();
    },
    canvas,
    insert,
    select,
    toolbar,
    inspector,
    undo: () => page.getByTestId("plumix-undo").click(),
    redo: () => page.getByTestId("plumix-redo").click(),
    richText,
    save,
    publish: async () => {
      // A published entry with pending edits publishes its draft instead.
      const button = page
        .getByTestId("plumix-editor-publish-button")
        .or(page.getByTestId("editor-draft-publish"));
      await button.click();
      // Disabled from the click until the published state arrives, and after.
      await expect(button).toBeDisabled();
      await save();
    },
    back: async () => {
      await page.getByTestId("plumix-editor-back").click();
      await expect(header).toBeHidden();
    },
    discard: () =>
      remounted(async () => {
        await page.getByTestId("editor-draft-discard").click();
        await page.getByTestId("editor-draft-discard-confirm").click();
      }),
    restoreRevision: async ({ id }) => {
      await page.getByTestId("revisions-sheet-trigger").click();
      await page
        .getByTestId(`revisions-sheet-item-${String(id)}-select`)
        .click();
      const banner = page.getByTestId("revision-preview-banner");
      await expect(banner).toBeVisible();
      await remounted(() =>
        banner.getByTestId("revision-preview-restore").click(),
      );
    },
    reload: async () => {
      await page.reload();
      await ready();
    },
    stored: async () => (await storedEntry("stored")).content?.blocks ?? [],
    storedDocument: async () => {
      const { title, meta, terms } = await storedEntry("storedDocument");
      return { title, meta, terms };
    },
    storedRevisions: async () => {
      const revisions: EditorStoredRevision[] = [];
      let cursor: string | null = null;
      do {
        const listed: StoredRevisionPage = await rpc(
          "storedRevisions",
          REVISIONS_LIST_PATH,
          { entryId: entryId(), cursor },
        );
        revisions.push(
          ...listed.revisions.map(({ id, title, message }) => ({
            id,
            title,
            message,
          })),
        );
        cursor = listed.nextCursor;
      } while (cursor !== null);
      return revisions;
    },
  };
}

/** Entry type name → the admin route segment its entries live under. */
async function readAdminSlugs(
  page: Page,
): Promise<ReadonlyMap<string, string>> {
  const response = await page.request.get(ADMIN_PATH);
  const manifest = readManifestScript(await response.text());
  return new Map(
    (manifest?.entryTypes ?? []).map((type) => [type.name, type.adminSlug]),
  );
}
