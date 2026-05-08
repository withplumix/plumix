// Plugin E2E. Mocks the manifest + session + RPC layer using
// `@plumix/core/test/playwright` so the real built admin chunk runs
// against a deterministic backend — no D1 needed for CI.
//
// Slice 7 acceptance:
//   1. Create a new menu.
//   2. Switch tabs.
//   3. Assign a menu to a location.
//   4. Reload — the assignment persists.

import type { Page, Route } from "@playwright/test";
import { expect, test } from "@playwright/test";

import type { PlumixManifest } from "@plumix/core/manifest";
import { slugify } from "@plumix/core";
import { emptyManifest } from "@plumix/core/manifest";
import {
  AUTHED_ADMIN,
  mockManifest,
  rpcOkBody,
  withCapabilities,
} from "@plumix/core/test/playwright";

const MENU_NAV_LABEL = "Menus";

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

interface MockState {
  menus: MenuRow[];
  locations: LocationRow[];
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
    return route.fulfill({ status: 404, body: "not-mocked" });
  });
}

test.describe("@plumix/plugin-menu — admin shell (slice 7)", () => {
  test("create menu, switch tab, assign location, reload — assignment persists", async ({
    page,
  }) => {
    const state: MockState = {
      menus: [],
      locations: [{ id: "primary", label: "Primary Nav", boundTermId: null }],
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
