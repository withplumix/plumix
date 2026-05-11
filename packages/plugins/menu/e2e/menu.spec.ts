// Plugin E2E. Mocks the manifest + session + RPC layer using
// `plumix/test/playwright` so the real built admin chunk runs
// against a deterministic backend — no D1 needed for CI.
//
// Slice 7 acceptance:
//   1. Create a new menu.
//   2. Switch tabs.
//   3. Assign a menu to a location.
//   4. Reload — the assignment persists.
//
// Slice 9.5 (#185) — drag-drop tree:
//   - Drag-nest round-trips through save + reload.
//   - Max-depth ceiling rejects a drop that would push a descendant
//     past the configured ceiling.
//   - KeyboardSensor reorder round-trips the same path as pointer
//     drag.

import type { Page, Route } from "@playwright/test";
import type { PlumixManifest } from "plumix/plugin";
import { expect, test } from "@playwright/test";
import { emptyManifest, slugify } from "plumix/plugin";
import {
  AUTHED_ADMIN,
  mockManifest,
  rpcOkBody,
  withCapabilities,
} from "plumix/test/playwright";

const MENU_NAV_LABEL = "Menus";
// MenuItemEditor.tsx — must match the constant in the component
// because drag projection compares `delta.x` against this width.
const INDENTATION_WIDTH = 24;

const MANIFEST: PlumixManifest = {
  ...emptyManifest(),
  adminNav: [
    {
      id: "appearance",
      label: "Appearance",
      priority: 175,
      items: [
        {
          to: "/pages/menus",
          label: MENU_NAV_LABEL,
          order: 10,
          capability: "term:menu:manage",
          coreIcon: "layout",
          component: "MenusShell",
        },
      ],
    },
  ],
};

const SESSION = withCapabilities(AUTHED_ADMIN, "term:menu:manage");

interface MenuRow {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly version: number;
  readonly itemCount: number;
}

interface LocationRow {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly boundTermId: number | null;
}

interface ServerMenuItem {
  readonly id: number;
  readonly parentId: number | null;
  readonly sortOrder: number;
  readonly title: string;
  readonly meta: Record<string, unknown>;
}

interface MenuDetail {
  readonly termId: number;
  version: number;
  maxDepth: number;
  items: ServerMenuItem[];
}

interface MockState {
  menus: MenuRow[];
  locations: LocationRow[];
  details: Map<number, MenuDetail>;
}

interface SavePayloadItem {
  readonly id?: number;
  readonly parentIndex: number | null;
  readonly sortOrder: number;
  readonly title: string | null;
  readonly meta: Record<string, unknown>;
}

function readJsonInput(route: Route): Record<string, unknown> {
  const body = route.request().postData();
  if (!body) return {};
  const parsed = JSON.parse(body) as { json?: Record<string, unknown> };
  return parsed.json ?? {};
}

async function mockMenuRpc(page: Page, state: MockState): Promise<void> {
  await page.route("**/_plumix/rpc/**", async (route) => {
    const url = route.request().url();
    const respond = (body: unknown): Promise<void> =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: rpcOkBody(body),
      });

    if (url.endsWith("/auth/session")) return respond(SESSION);
    if (url.endsWith("/menu/list")) return respond(state.menus);
    if (url.endsWith("/menu/locations/list")) return respond(state.locations);
    if (url.endsWith("/menu/pickerTabs")) return respond([]);
    if (url.endsWith("/menu/create")) {
      const input = readJsonInput(route) as { name: string };
      const name = input.name.trim();
      const slug = slugify(name);
      const newId = state.menus.reduce((max, m) => Math.max(max, m.id), 0) + 1;
      const created: MenuRow = {
        id: newId,
        slug,
        name,
        version: 0,
        itemCount: 0,
      };
      state.menus = [...state.menus, created];
      state.details.set(newId, {
        termId: newId,
        version: 0,
        maxDepth: 5,
        items: [],
      });
      return respond({ termId: newId, slug, version: 0 });
    }
    if (url.endsWith("/menu/assignLocation")) {
      const input = readJsonInput(route) as {
        location: string;
        termSlug: string | null;
      };
      const matched = state.menus.find((m) => m.slug === input.termSlug);
      state.locations = state.locations.map((loc) =>
        loc.id === input.location
          ? { ...loc, boundTermId: matched ? matched.id : null }
          : loc,
      );
      return respond({ location: input.location, termSlug: input.termSlug });
    }
    if (url.endsWith("/menu/get")) {
      const input = readJsonInput(route) as { termId: number };
      const detail = state.details.get(input.termId);
      const menu = state.menus.find((m) => m.id === input.termId);
      if (!detail || !menu) {
        return route.fulfill({ status: 404, body: "menu-not-found" });
      }
      return respond({
        id: detail.termId,
        slug: menu.slug,
        name: menu.name,
        version: detail.version,
        maxDepth: detail.maxDepth,
        items: detail.items,
      });
    }
    if (url.endsWith("/menu/save")) {
      const input = readJsonInput(route) as {
        readonly termId: number;
        readonly version: number;
        readonly maxDepth?: number;
        readonly items: readonly SavePayloadItem[];
      };
      const detail = state.details.get(input.termId);
      if (!detail) {
        return route.fulfill({ status: 404, body: "menu-not-found" });
      }
      // Mirror the server: items in `input.items` reference their
      // parent by index in the SAME list. We translate parentIndex →
      // parentId by assigning fresh ids in flat order, then walking
      // the resulting array to back-fill parent ids.
      const idForIndex: number[] = [];
      let nextId = detail.items.reduce((max, it) => Math.max(max, it.id), 0);
      input.items.forEach((row, index) => {
        const id = row.id ?? ++nextId;
        idForIndex[index] = id;
      });
      const items: ServerMenuItem[] = input.items.map((row, index) => ({
        id: idForIndex[index] ?? 0,
        parentId:
          row.parentIndex === null
            ? null
            : (idForIndex[row.parentIndex] ?? null),
        sortOrder: row.sortOrder,
        title: row.title ?? "",
        meta: row.meta,
      }));
      detail.items = items;
      detail.version += 1;
      if (input.maxDepth !== undefined) detail.maxDepth = input.maxDepth;
      state.menus = state.menus.map((m) =>
        m.id === input.termId
          ? { ...m, version: detail.version, itemCount: items.length }
          : m,
      );
      return respond({
        termId: input.termId,
        version: detail.version,
        itemIds: items.map((it) => it.id),
        added: [],
        removed: [],
        modified: items.map((it) => it.id),
      });
    }
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
}

function seededMenuState({
  items,
  maxDepth = 5,
}: {
  readonly items: readonly ServerMenuItem[];
  readonly maxDepth?: number;
}): MockState {
  const menu: MenuRow = {
    id: 1,
    slug: "primary",
    name: "Primary",
    version: 0,
    itemCount: items.length,
  };
  const detail: MenuDetail = {
    termId: 1,
    version: 0,
    maxDepth,
    items: items.map((it) => ({ ...it })),
  };
  return {
    menus: [menu],
    locations: [{ id: "primary", label: "Primary Nav", boundTermId: null }],
    details: new Map([[1, detail]]),
  };
}

function customItem(
  id: number,
  title: string,
  url: string,
  parentId: number | null,
  sortOrder = 0,
): ServerMenuItem {
  return {
    id,
    parentId,
    sortOrder,
    title,
    meta: { kind: "custom", url },
  };
}

async function openItemsEditor(page: Page): Promise<void> {
  await page.goto("pages/menus");
  await expect(page.getByTestId("menus-shell")).toBeVisible();
  await page.getByTestId("menus-selector-option-primary").click();
  await expect(page.getByTestId("menu-item-editor")).toBeVisible();
}

async function dragRowOverTarget(
  page: Page,
  sourceId: number,
  targetId: number,
  options: { readonly nestPx?: number } = {},
): Promise<void> {
  // dnd-kit's PointerSensor listens for native `pointerdown` /
  // `pointermove` / `pointerup` events with a `distance: 5`
  // activation gate. Playwright's `page.mouse` API and `dragTo`
  // helper synthesize Mouse events but the corresponding Pointer
  // events don't always fire in a sequence the sensor accepts, so
  // we dispatch the pointer events ourselves inside a single
  // `page.evaluate` call (one CDP roundtrip instead of 14) so the
  // sequence runs in a single microtask burst without test timeout
  // pressure.
  const handle = page.getByTestId(`menu-item-drag-${String(sourceId)}`);
  const target = page.getByTestId(`menu-item-row-${String(targetId)}`);
  const handleBox = await handle.boundingBox();
  const targetBox = await target.boundingBox();
  if (!handleBox || !targetBox) {
    throw new Error(
      `missing bounding box for source ${String(sourceId)} or target ${String(targetId)}`,
    );
  }
  const sourceSelector = `[data-testid="menu-item-drag-${String(sourceId)}"]`;
  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  const dropX = targetBox.x + targetBox.width / 2 + (options.nestPx ?? 0);
  const dropY = targetBox.y + targetBox.height / 2;

  await page.evaluate(
    async ({ selector, startX, startY, dropX, dropY }) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`drag handle not found: ${selector}`);
      const base = {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        bubbles: true,
        cancelable: true,
      } as const;
      const yieldToReact = (): Promise<void> =>
        new Promise((resolve) => requestAnimationFrame(() => resolve()));

      // pointerdown is dispatched on the activator (drag handle) so
      // dnd-kit's PointerSensor binds the drag to this pointerId.
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          ...base,
          button: 0,
          buttons: 1,
          clientX: startX,
          clientY: startY,
        }),
      );
      await yieldToReact();

      // After activation, dnd-kit attaches `pointermove` / `pointerup`
      // listeners on `ownerDocument`, NOT on the activator element. So
      // the rest of the sequence must dispatch on `document` to reach
      // the sensor.
      const steps = 12;
      for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        document.dispatchEvent(
          new PointerEvent("pointermove", {
            ...base,
            button: 0,
            buttons: 1,
            clientX: startX + (dropX - startX) * t,
            clientY: startY + (dropY - startY) * t,
          }),
        );
        await yieldToReact();
      }
      document.dispatchEvent(
        new PointerEvent("pointerup", {
          ...base,
          button: 0,
          buttons: 0,
          clientX: dropX,
          clientY: dropY,
        }),
      );
    },
    { selector: sourceSelector, startX, startY, dropX, dropY },
  );
}

test.describe("@plumix/plugin-menu — admin shell (slice 7)", () => {
  test("create menu, switch tab, assign location, reload — assignment persists", async ({
    page,
  }) => {
    const state: MockState = {
      menus: [],
      locations: [{ id: "primary", label: "Primary Nav", boundTermId: null }],
      details: new Map(),
    };

    page.on("dialog", (dialog) => {
      void dialog.accept("Header Nav");
    });
    await mockManifest(page, MANIFEST);
    await mockMenuRpc(page, state);

    await page.goto("pages/menus");
    await expect(page.getByTestId("menus-shell")).toBeVisible();

    // 1. Create a new menu via the sentinel.
    await page.getByTestId("menus-selector-create-new").click();
    await expect(
      page.getByTestId("menus-selector-option-header-nav"),
    ).toBeVisible();

    // 2. Switch to the Locations tab.
    await page.getByTestId("menus-tab-locations").click();
    await expect(page.getByTestId("menus-tab-locations-panel")).toBeVisible();

    // 3. Assign the new menu to the Primary Nav location.
    await page
      .getByTestId("menus-location-select-primary")
      .selectOption("header-nav");

    // 4. Reload and confirm the binding persists from the mocked backend.
    await page.reload();
    await page.getByTestId("menus-tab-locations").click();
    await expect(page.getByTestId("menus-location-select-primary")).toHaveValue(
      "header-nav",
    );
  });
});

test.describe("@plumix/plugin-menu — drag-drop tree (slice 9.5)", () => {
  // The pointer-driven tests dispatch a sequence of pointer events
  // with rAF yields between moves so React commits dnd-kit's `active`
  // state between hits. That dispatch loop adds ~250ms on top of the
  // usual editor boot, so allow the test more headroom than the
  // 30s default.
  test.setTimeout(60_000);

  test("drag-nest: dropping B under A persists across reload", async ({
    page,
  }) => {
    const state = seededMenuState({
      items: [
        customItem(1, "Home", "/", null, 0),
        customItem(2, "Docs", "/docs", null, 1),
      ],
    });
    await mockManifest(page, MANIFEST);
    await mockMenuRpc(page, state);
    await openItemsEditor(page);

    // Drop Docs (id=2) onto its own row with a one-indent horizontal
    // offset. The projection then sees previous=Home (depth 0) and
    // bumps Docs to depth 1 (child of Home).
    await dragRowOverTarget(page, 2, 2, { nestPx: INDENTATION_WIDTH });

    // After drag, the in-memory state's depth bumped.
    const rowBefore = page.getByTestId("menu-item-row-2");
    await expect(rowBefore).toHaveAttribute("data-depth", "1");

    // Give React time to commit the post-drag state to the save
    // button's click handler closure. Without this gap the click
    // routes to a stale onClick that captures `state.dirty=false`,
    // short-circuits the mutation, and never fires the fetch.
    await page.waitForTimeout(100);

    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/menu/save") && r.status() === 200,
    );
    await page.getByTestId("menu-save-button").click();
    await saved;

    await page.reload();
    await openItemsEditor(page);
    await expect(page.getByTestId("menu-item-row-2")).toHaveAttribute(
      "data-depth",
      "1",
    );
  });

  test("max-depth ceiling: drag attempt past the configured depth makes no change", async ({
    page,
  }) => {
    // maxDepth=1 means everything must live at depth 0 or 1. With
    // items [Home (0), Docs (0)], dragging Docs under Home is the
    // permitted depth-1 case; attempting any deeper push (no parent
    // chain to nest under, so a single drop can't exceed 1) leaves
    // Docs at depth 1 maximum. With a single-flat list and maxDepth=0
    // we instead verify that the projection's depthCap clamps the
    // drop to depth 0 — i.e. no nesting happens even when the
    // pointer offset asks for it.
    const state = seededMenuState({
      items: [
        customItem(1, "Home", "/", null, 0),
        customItem(2, "Docs", "/docs", null, 1),
      ],
      maxDepth: 0,
    });
    await mockManifest(page, MANIFEST);
    await mockMenuRpc(page, state);
    await openItemsEditor(page);

    await expect(page.getByTestId("menu-item-row-2")).toHaveAttribute(
      "data-depth",
      "0",
    );
    // The horizontal offset asks for depth 1 (one indent width to the
    // right of the row's own slot), but the projection clamps to
    // depthCap=maxDepth=0.
    await dragRowOverTarget(page, 2, 2, { nestPx: INDENTATION_WIDTH });
    await expect(page.getByTestId("menu-item-row-2")).toHaveAttribute(
      "data-depth",
      "0",
    );
  });

  test("keyboard reorder: Space + ArrowDown + Space swaps two adjacent items", async ({
    page,
  }) => {
    const state = seededMenuState({
      items: [
        customItem(1, "Home", "/", null, 0),
        customItem(2, "Docs", "/docs", null, 1),
      ],
    });
    await mockManifest(page, MANIFEST);
    await mockMenuRpc(page, state);
    await openItemsEditor(page);

    // Reorder via the KeyboardSensor wired in MenuItemEditor. Pickup
    // with Space, move down past the next row, drop with Space. The
    // drag handle is a `<button>`, so Space would normally trigger
    // a native click — dnd-kit's KeyboardSensor calls preventDefault
    // when it sees Space on the focused activator, so the click is
    // suppressed and the sensor activates instead.
    const handle = page.getByTestId("menu-item-drag-1");
    await handle.focus();
    await page.keyboard.press("Space");
    await page.waitForTimeout(50);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(50);
    await page.keyboard.press("Space");

    // After reorder, the persisted save→reload trip should show Docs
    // before Home in the DOM order. We assert via the rows' order in
    // the menu-tree container.
    const saved = page.waitForResponse(
      (r) => r.url().endsWith("/menu/save") && r.status() === 200,
    );
    await page.getByTestId("menu-save-button").click();
    await saved;
    await page.reload();
    await openItemsEditor(page);

    const rows = page
      .getByTestId("menu-tree")
      .locator("[data-testid^='menu-item-row-']");
    await expect(rows.first()).toHaveAttribute(
      "data-testid",
      "menu-item-row-2",
    );
    await expect(rows.last()).toHaveAttribute("data-testid", "menu-item-row-1");
  });
});
