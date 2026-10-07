import type { JsonValue } from "plumix";
import type { PluginRpcCall, PluginRpcStub } from "plumix/test";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { i18n, I18nProvider } from "plumix/i18n";
import { PluginRpcError, stubPluginRpc } from "plumix/test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { MenusShell } from "./MenusShell.js";

// What the server's resolver attaches to every row it sends back.
function okResolved(label: string): JsonValue {
  return { state: "ok", label, href: null, lastHref: null };
}

let stub: PluginRpcStub;

function mockRpc(
  routes: Record<string, JsonValue>,
  responders: Record<string, (input: unknown) => JsonValue> = {},
): void {
  const served: Record<string, (input: unknown) => JsonValue> = {
    ...responders,
  };
  for (const [procedure, value] of Object.entries(routes)) {
    served[procedure] = () => value;
  }
  stub = stubPluginRpc("menu", served);
}

interface SearchTargetsInput {
  readonly kind: string;
  readonly target: string;
  readonly query?: string;
}

// Serves `searchTargets` the way the server does: a case-insensitive
// substring match over the tab's own targets.
function searchTargetsFrom(
  byTarget: Record<string, readonly { id: string; label: string | null }[]>,
): (input: unknown) => JsonValue {
  return (input) => {
    const { target, query } = input as SearchTargetsInput;
    const needle = (query ?? "").toLowerCase();
    return {
      items: (byTarget[target] ?? [])
        .filter((item) => (item.label ?? "").toLowerCase().includes(needle))
        .map((item) => ({
          ...item,
          targetType: target,
          subtitle: `${target} · published`,
        })),
    };
  };
}

function searchTargetsCalls(): SearchTargetsInput[] {
  return stub.calls
    .filter((call) => call.procedure === "searchTargets")
    .map((call) => call.input as SearchTargetsInput);
}

function findRpcCall(procedure: string): PluginRpcCall | undefined {
  return stub.lastCallTo(procedure);
}

function parseRpcInput<T>(call: PluginRpcCall): T {
  return call.input as T;
}

function renderShell(): void {
  i18n.load({ en: {} });
  i18n.activate("en");
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return (
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </I18nProvider>
    );
  }
  render(<MenusShell />, { wrapper: Wrapper });
}

describe("MenusShell", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/_plumix/admin/pages/menus");
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  describe("page heading", () => {
    test("renders a page-level Menus heading", async () => {
      mockRpc({
        list: [{ id: 1, slug: "main", name: "Main", version: 1, itemCount: 0 }],
        "locations/list": [],
      });
      renderShell();

      const heading = await screen.findByTestId("menus-heading");
      expect(heading).toHaveTextContent("Menus");
    });
  });

  describe("empty state", () => {
    test("renders the create-first-menu CTA when no menus exist", async () => {
      mockRpc({
        list: [],
        "locations/list": [],
      });
      renderShell();

      const cta = await screen.findByTestId("menus-empty-cta");
      expect(cta).toBeInTheDocument();
    });
  });

  describe("create flow", () => {
    test("the create dialog names a menu and calls menu.create", async () => {
      mockRpc({
        list: [],
        "locations/list": [],
        create: {
          termId: 99,
          slug: "header-nav",
          version: 1,
        },
      });

      renderShell();
      const user = userEvent.setup();
      await user.click(await screen.findByTestId("menus-selector-create-new"));
      await user.type(
        await screen.findByTestId("menus-create-name"),
        "Header Nav",
      );
      await user.click(screen.getByTestId("menus-create-submit"));

      const createCall = await vi.waitFor(() => {
        const found = findRpcCall("create");
        if (!found) throw new Error("menu.create not called yet");
        return found;
      });
      const input = parseRpcInput<{ name: string }>(createCall);
      expect(input.name).toBe("Header Nav");
      await vi.waitFor(() =>
        expect(window.location.search).toMatch(/[?&]menu=header-nav\b/),
      );
    });

    test("dismissing the create dialog is a no-op", async () => {
      mockRpc({
        list: [],
        "locations/list": [],
      });

      renderShell();
      const user = userEvent.setup();
      await user.click(await screen.findByTestId("menus-selector-create-new"));
      await screen.findByTestId("menus-create-name");
      await user.keyboard("{Escape}");

      expect(findRpcCall("create")).toBeUndefined();
    });
  });

  describe("tabs", () => {
    test("defaults to the edit tab when ?tab= is absent", async () => {
      mockRpc({
        list: [{ id: 1, slug: "main", name: "Main", version: 1, itemCount: 0 }],
        "locations/list": [],
      });

      renderShell();

      expect(
        await screen.findByTestId("menus-tab-edit-panel"),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("menus-tab-locations-panel")).toBeNull();
    });

    test("renders the locations panel when ?tab=locations is set", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?tab=locations",
      );
      mockRpc({
        list: [{ id: 1, slug: "main", name: "Main", version: 1, itemCount: 0 }],
        "locations/list": [],
      });

      renderShell();

      expect(
        await screen.findByTestId("menus-tab-locations-panel"),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("menus-tab-edit-panel")).toBeNull();
    });

    test("clicking a tab updates the query param and swaps panels", async () => {
      mockRpc({
        list: [{ id: 1, slug: "main", name: "Main", version: 1, itemCount: 0 }],
        "locations/list": [],
      });

      renderShell();
      const user = userEvent.setup();
      await user.click(await screen.findByTestId("menus-tab-locations"));

      expect(window.location.search).toMatch(/[?&]tab=locations\b/);
      expect(
        await screen.findByTestId("menus-tab-locations-panel"),
      ).toBeInTheDocument();
    });
  });

  describe("locations table", () => {
    test("renders one row per registered location with current binding selected", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?tab=locations",
      );
      mockRpc({
        list: [
          { id: 1, slug: "main", name: "Main", version: 1, itemCount: 0 },
          { id: 2, slug: "footer", name: "Footer", version: 1, itemCount: 0 },
        ],
        "locations/list": [
          { id: "footer", label: "Footer Slot", boundTermId: null },
          { id: "primary", label: "Primary Nav", boundTermId: 1 },
        ],
      });

      renderShell();

      const primarySelect = await screen.findByTestId(
        "menus-location-select-primary",
      );
      expect(primarySelect).toBeInTheDocument();
      // The Radix trigger shows the bound menu's name (or the unassigned hint).
      expect(primarySelect).toHaveTextContent("Main");

      const footerSelect = await screen.findByTestId(
        "menus-location-select-footer",
      );
      expect(footerSelect).toHaveTextContent("Unassigned");
    });

    test("each select reflects its own persisted binding when every location is assigned", async () => {
      // Regression for the blog example: both Primary and Footer were
      // bound (and rendered on the frontend) yet both selects showed
      // "— Unassigned —". The fix persists the binding in settings so
      // `boundTermId` arrives; the select must pre-select per row, not
      // collapse to the first / to empty.
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?tab=locations",
      );
      mockRpc({
        list: [
          {
            id: 30,
            slug: "primary",
            name: "Primary",
            version: 1,
            itemCount: 3,
          },
          { id: 31, slug: "footer", name: "Footer", version: 1, itemCount: 3 },
        ],
        "locations/list": [
          { id: "footer", label: "Footer", boundTermId: 31 },
          { id: "primary", label: "Primary", boundTermId: 30 },
        ],
      });

      renderShell();

      const primarySelect = await screen.findByTestId(
        "menus-location-select-primary",
      );
      expect(primarySelect).toHaveTextContent("Primary");
      const footerSelect = await screen.findByTestId(
        "menus-location-select-footer",
      );
      expect(footerSelect).toHaveTextContent("Footer");
    });

    test("changing a select calls menu.assignLocation with the new termSlug", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?tab=locations",
      );
      mockRpc({
        list: [
          { id: 1, slug: "main", name: "Main", version: 1, itemCount: 0 },
          { id: 2, slug: "footer", name: "Footer", version: 1, itemCount: 0 },
        ],
        "locations/list": [
          { id: "primary", label: "Primary Nav", boundTermId: null },
        ],
        assignLocation: { location: "primary", termSlug: "main" },
      });

      renderShell();
      await screen.findByTestId("menus-location-select-primary");
      const user = userEvent.setup();
      await user.click(screen.getByTestId("menus-location-select-primary"));
      await user.click(
        screen.getByTestId("menus-location-select-primary-main"),
      );

      const call = await vi.waitFor(() => {
        const found = findRpcCall("assignLocation");
        if (!found) throw new Error("assignLocation not called");
        return found;
      });
      const input = parseRpcInput<{
        location: string;
        termSlug: string | null;
      }>(call);
      expect(input).toEqual({ location: "primary", termSlug: "main" });
    });

    test("selecting the empty option clears the binding (null termSlug)", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?tab=locations",
      );
      mockRpc({
        list: [{ id: 1, slug: "main", name: "Main", version: 1, itemCount: 0 }],
        "locations/list": [
          { id: "primary", label: "Primary Nav", boundTermId: 1 },
        ],
        assignLocation: { location: "primary", termSlug: null },
      });

      renderShell();
      await screen.findByTestId("menus-location-select-primary");
      const user = userEvent.setup();
      await user.click(screen.getByTestId("menus-location-select-primary"));
      await user.click(
        screen.getByTestId("menus-location-select-primary-unassigned"),
      );

      const call = await vi.waitFor(() => {
        const found = findRpcCall("assignLocation");
        if (!found) throw new Error("assignLocation not called");
        return found;
      });
      const input = parseRpcInput<{
        location: string;
        termSlug: string | null;
      }>(call);
      expect(input).toEqual({ location: "primary", termSlug: null });
    });
  });

  describe("edit tab — item editor", () => {
    test("on version_mismatch CONFLICT renders a reload banner that refetches menu.get", async () => {
      // The server returns 409 with `data.reason: 'version_mismatch'`
      // when another tab saved between this editor's load and this
      // save. Acceptance: surface the conflict as a visible banner with
      // a reload action; no silent data loss.
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      let getCallCount = 0;
      stubPluginRpc("menu", {
        list: () => [
          { id: 7, slug: "main", name: "Main", version: 1, itemCount: 0 },
        ],
        "locations/list": () => [],
        pickerTabs: () => [{ kind: "custom", tabLabel: "Custom URL" }],
        get: () => {
          getCallCount += 1;
          // First fetch returns v1 (editor's starting point); after the
          // user clicks Reload, refetch returns v2 with a fresh item —
          // so the test can assert state actually mirrored the new
          // server data.
          return getCallCount === 1
            ? {
                id: 7,
                slug: "main",
                name: "Main",
                version: 1,
                maxDepth: 5,
                items: [],
              }
            : {
                id: 7,
                slug: "main",
                name: "Main",
                version: 2,
                maxDepth: 5,
                items: [
                  {
                    id: 42,
                    parentId: null,
                    sortOrder: 0,
                    title: "Reloaded",
                    resolved: okResolved("Reloaded"),
                    meta: { kind: "custom", url: "/r" },
                  },
                ],
              };
        },
        save: () => {
          throw new PluginRpcError("CONFLICT", {
            status: 409,
            message: "concurrent edit",
            data: { reason: "version_mismatch", key: "1" },
          });
        },
      });

      renderShell();
      const user = userEvent.setup();
      await screen.findByTestId("menu-item-list-empty");
      const initialGetCount = getCallCount;
      await user.click(await screen.findByTestId("menu-save-button"));

      const banner = await screen.findByTestId("menu-conflict-banner");
      expect(banner).toBeInTheDocument();
      const reload = await screen.findByTestId("menu-conflict-reload");
      await user.click(reload);

      await vi.waitFor(() => {
        expect(getCallCount).toBeGreaterThan(initialGetCount);
      });
      // The acceptance is "no silent data loss" — the user clicked
      // Reload and must actually see the new server state, not the
      // stale local one. The fresh fixture has a new row with id 42.
      expect(await screen.findByTestId("menu-item-row-42")).toBeInTheDocument();

      // The banner must re-arm after the reload + a SECOND racing save
      // also hits version_mismatch (different editor took a third bite).
      // Earlier `dismissed` boolean stayed `true` forever after the first
      // reload click and suppressed every subsequent banner — that's the
      // silent-data-loss regression this assertion guards.
      await user.click(await screen.findByTestId("menu-save-button"));
      expect(
        await screen.findByTestId("menu-conflict-banner"),
      ).toBeInTheDocument();
    });

    test("Save button posts current items + version to menu.save", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 4, itemCount: 0 }],
        "locations/list": [],
        pickerTabs: [{ kind: "custom", tabLabel: "Custom URL" }],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 4,
          maxDepth: 5,
          items: [],
        },
        save: {
          termId: 7,
          version: 5,
          itemIds: [101],
          added: [101],
          removed: [],
          modified: [],
        },
      });

      renderShell();

      const user = userEvent.setup();
      await user.click(await screen.findByTestId("menu-picker-tab-custom"));
      await user.type(
        await screen.findByTestId("menu-picker-custom-url"),
        "/x",
      );
      await user.type(
        await screen.findByTestId("menu-picker-custom-label"),
        "X",
      );
      await user.click(await screen.findByTestId("menu-picker-custom-add"));

      await user.click(await screen.findByTestId("menu-save-button"));

      const call = await vi.waitFor(() => {
        const found = findRpcCall("save");
        if (!found) throw new Error("menu.save not called");
        return found;
      });
      const input = parseRpcInput<{
        termId: number;
        version: number;
        items: readonly { title: string | null; meta: { kind: string } }[];
      }>(call);
      expect(input).toMatchObject({
        termId: 7,
        version: 4,
      });
      expect(input.items).toHaveLength(1);
      expect(input.items[0]?.title).toBe("X");
      expect(input.items[0]?.meta).toEqual({ kind: "custom", url: "/x" });
    });

    test("delete-menu button confirms then calls menu.delete with the termId", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 1, itemCount: 0 }],
        "locations/list": [],
        pickerTabs: [{ kind: "custom", tabLabel: "Custom URL" }],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [],
        },
        delete: { id: 7 },
      });

      renderShell();
      const user = userEvent.setup();
      // Opens the confirm AlertDialog; the destructive action fires the delete.
      await user.click(await screen.findByTestId("menu-delete-button"));
      await user.click(await screen.findByTestId("menu-delete-confirm"));

      const call = await vi.waitFor(() => {
        const found = findRpcCall("delete");
        if (!found) throw new Error("menu.delete not called");
        return found;
      });
      const input = parseRpcInput<{ termId: number }>(call);
      expect(input.termId).toBe(7);
    });

    test("delete-menu button matches the save button's size and is destructive-styled", async () => {
      // Both render the shared `Button size="sm"`, so the size classes match
      // by construction (the original regression was hand-rolled buttons with
      // mismatched padding). Delete uses the destructive variant (solid).
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 1, itemCount: 0 }],
        "locations/list": [],
        pickerTabs: [{ kind: "custom", tabLabel: "Custom URL" }],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [],
        },
      });

      renderShell();

      const save = await screen.findByTestId("menu-save-button");
      const del = await screen.findByTestId("menu-delete-button");
      for (const cls of ["h-8", "px-3", "text-sm", "rounded-md"]) {
        expect(save.classList.contains(cls)).toBe(true);
        expect(del.classList.contains(cls)).toBe(true);
      }
      expect(del.classList.contains("bg-destructive")).toBe(true);
    });

    test("the picker tabs are tabs: the first is selected on load and ArrowRight moves selection", async () => {
      // Entry tabs share kind="entry", so each tab keys on kind-target and
      // selects on its own.
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 1, itemCount: 0 }],
        "locations/list": [],
        pickerTabs: [
          { kind: "entry", tabLabel: "Pages", target: "page" },
          { kind: "entry", tabLabel: "Posts", target: "post" },
          { kind: "custom", tabLabel: "Custom URL" },
        ],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [],
        },
        searchTargets: { items: [] },
      });

      renderShell();
      const user = userEvent.setup();

      const pages = await screen.findByTestId("menu-picker-tab-entry-page");
      const posts = await screen.findByTestId("menu-picker-tab-entry-post");
      expect(pages).toHaveAttribute("role", "tab");
      expect(pages).toHaveAttribute("aria-selected", "true");
      expect(posts).toHaveAttribute("aria-selected", "false");

      await user.click(pages);
      await user.keyboard("{ArrowRight}");
      expect(posts).toHaveAttribute("aria-selected", "true");
      expect(pages).toHaveAttribute("aria-selected", "false");

      // Custom URL still swaps to its own add-item panel.
      await user.click(await screen.findByTestId("menu-picker-tab-custom"));
      expect(
        await screen.findByTestId("menu-picker-custom-url"),
      ).toBeInTheDocument();
    });

    test("an entry tab searches its type and adds the chosen entry from the keyboard", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc(
        {
          list: [
            { id: 7, slug: "main", name: "Main", version: 1, itemCount: 0 },
          ],
          "locations/list": [],
          pickerTabs: [
            { kind: "entry", tabLabel: "Posts", target: "post" },
            { kind: "custom", tabLabel: "Custom URL" },
          ],
          get: {
            id: 7,
            slug: "main",
            name: "Main",
            version: 1,
            maxDepth: 5,
            items: [],
          },
          save: {
            termId: 7,
            version: 2,
            itemIds: [50],
            added: [50],
            removed: [],
            modified: [],
          },
        },
        {
          searchTargets: searchTargetsFrom({
            post: [
              { id: "11", label: "About us" },
              { id: "12", label: "Contact" },
            ],
          }),
        },
      );

      renderShell();
      const user = userEvent.setup();

      const panel = await screen.findByTestId("menu-picker-linked-panel");
      await vi.waitFor(() => {
        expect(searchTargetsCalls()[0]).toMatchObject({
          kind: "entry",
          target: "post",
        });
      });
      expect(panel).toHaveTextContent("Contact");

      const search = screen.getByTestId("menu-picker-search-input");
      expect(search).toHaveAccessibleName("Search Posts…");
      await user.type(search, "abo");
      await vi.waitFor(() => {
        expect(searchTargetsCalls().at(-1)?.query).toBe("abo");
      });
      await vi.waitFor(() => {
        expect(screen.queryByTestId("menu-picker-option-12")).toBeNull();
      });

      await user.keyboard("{ArrowDown}{Enter}");

      const tree = await screen.findByTestId("menu-tree");
      expect(tree).toHaveTextContent("About us");
      expect(screen.getByTestId("menu-item-drag-tmp-0")).toHaveAccessibleName(
        "Reorder About us",
      );
      expect(search).toHaveFocus();

      await user.click(screen.getByTestId("menu-save-button"));
      const call = await vi.waitFor(() => {
        const found = findRpcCall("save");
        if (!found) throw new Error("menu.save not called");
        return found;
      });
      const payload = parseRpcInput<{
        items: readonly { title: string | null; meta: JsonValue }[];
      }>(call);
      expect(payload.items).toEqual([
        expect.objectContaining({
          title: null,
          meta: { kind: "entry", entryId: 11 },
        }),
      ]);
    });

    test("a term tab searches its taxonomy and adds the chosen term from the keyboard", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc(
        {
          list: [
            { id: 7, slug: "main", name: "Main", version: 1, itemCount: 0 },
          ],
          "locations/list": [],
          pickerTabs: [
            { kind: "entry", tabLabel: "Posts", target: "post" },
            { kind: "term", tabLabel: "Categories", target: "category" },
            { kind: "custom", tabLabel: "Custom URL" },
          ],
          get: {
            id: 7,
            slug: "main",
            name: "Main",
            version: 1,
            maxDepth: 5,
            items: [],
          },
          save: {
            termId: 7,
            version: 2,
            itemIds: [51],
            added: [51],
            removed: [],
            modified: [],
          },
        },
        {
          searchTargets: searchTargetsFrom({
            post: [],
            category: [
              { id: "3", label: "News" },
              { id: "4", label: "Guides" },
            ],
          }),
        },
      );

      renderShell();
      const user = userEvent.setup();

      await user.click(
        await screen.findByTestId("menu-picker-tab-term-category"),
      );
      await vi.waitFor(() => {
        expect(searchTargetsCalls().at(-1)).toMatchObject({
          kind: "term",
          target: "category",
        });
      });
      const search = await screen.findByTestId("menu-picker-search-input");
      expect(search).toHaveAccessibleName("Search Categories…");
      await user.type(search, "gui");
      await vi.waitFor(() => {
        expect(screen.queryByTestId("menu-picker-option-3")).toBeNull();
      });
      await user.keyboard("{ArrowDown}{Enter}");

      expect(await screen.findByTestId("menu-tree")).toHaveTextContent(
        "Guides",
      );
      await user.click(screen.getByTestId("menu-save-button"));
      const call = await vi.waitFor(() => {
        const found = findRpcCall("save");
        if (!found) throw new Error("menu.save not called");
        return found;
      });
      const payload = parseRpcInput<{
        items: readonly { title: string | null; meta: JsonValue }[];
      }>(call);
      expect(payload.items).toEqual([
        expect.objectContaining({
          title: null,
          meta: { kind: "term", termId: 4 },
        }),
      ]);
    });

    test("settings panel location checkboxes reflect bindings and toggle via menu.assignLocation", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 1, itemCount: 0 }],
        "locations/list": [
          { id: "primary", label: "Primary Nav", boundTermId: 7 },
          { id: "footer", label: "Footer Slot", boundTermId: null },
        ],
        pickerTabs: [{ kind: "custom", tabLabel: "Custom URL" }],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [],
        },
        assignLocation: { location: "footer", termSlug: "main" },
      });

      renderShell();

      // The shared `Checkbox` renders a radix `<button role="checkbox">`,
      // so checked-ness is `aria-checked`, not the native `.checked` prop.
      const primary = await screen.findByTestId(
        "menu-settings-location-primary",
      );
      expect(primary).toHaveAttribute("aria-checked", "true");

      const footer = await screen.findByTestId("menu-settings-location-footer");
      expect(footer).toHaveAttribute("aria-checked", "false");

      const user = userEvent.setup();
      await user.click(footer);

      const call = await vi.waitFor(() => {
        const found = findRpcCall("assignLocation");
        if (!found) throw new Error("assignLocation not called");
        return found;
      });
      const input = parseRpcInput<{
        location: string;
        termSlug: string | null;
      }>(call);
      expect(input).toEqual({ location: "footer", termSlug: "main" });
    });

    test("clicking a row opens a detail panel; clearing the label override saves as title null", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 1, itemCount: 1 }],
        "locations/list": [],
        pickerTabs: [{ kind: "custom", tabLabel: "Custom URL" }],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 99,
              parentId: null,
              sortOrder: 0,
              title: "Original",
              resolved: okResolved("Original"),
              meta: { kind: "custom", url: "/" },
            },
          ],
        },
        save: {
          termId: 7,
          version: 2,
          itemIds: [99],
          added: [],
          removed: [],
          modified: [99],
        },
      });

      renderShell();

      const user = userEvent.setup();
      const row = await screen.findByTestId("menu-item-row-99");
      await user.click(row);

      const titleInput = await screen.findByTestId<HTMLInputElement>(
        "menu-item-detail-title",
      );
      expect(titleInput.value).toBe("Original");
      await user.clear(titleInput);

      await user.click(await screen.findByTestId("menu-save-button"));

      const call = await vi.waitFor(() => {
        const found = findRpcCall("save");
        if (!found) throw new Error("menu.save not called");
        return found;
      });
      const input = parseRpcInput<{
        items: readonly { id?: number; title: string | null }[];
      }>(call);
      expect(input.items[0]?.id).toBe(99);
      expect(input.items[0]?.title).toBeNull();
    });

    test("the detail panel labels the title input and offers a linked item's title as its placeholder", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 1, itemCount: 1 }],
        "locations/list": [],
        pickerTabs: [{ kind: "custom", tabLabel: "Custom URL" }],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 40,
              parentId: null,
              sortOrder: 0,
              title: "Who we are",
              meta: { kind: "entry", entryId: 11, lastLabel: "About us" },
              resolved: {
                state: "ok",
                label: "Who we are",
                linkedLabel: "About us",
                href: "/about-us",
                lastHref: "/about-us",
              },
            },
          ],
        },
      });

      renderShell();
      const user = userEvent.setup();

      const row = await screen.findByTestId("menu-item-row-40");
      await user.click(row);

      const input = screen.getByTestId("menu-item-detail-title");
      expect(input).toHaveAccessibleName("Navigation label");
      expect(input).toHaveValue("Who we are");
      expect(input).toHaveAttribute("placeholder", "About us");
      expect(screen.getByTestId("menu-item-detail-linked")).toHaveTextContent(
        "About us",
      );

      fireEvent.change(input, { target: { value: "" } });
      expect(row).toHaveTextContent("About us");
    });

    test("custom URL picker tab adds a new item to the in-memory list", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 1, itemCount: 0 }],
        "locations/list": [],
        pickerTabs: [{ kind: "custom", tabLabel: "Custom URL" }],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [],
        },
      });

      renderShell();

      const customTab = await screen.findByTestId("menu-picker-tab-custom");
      const user = userEvent.setup();
      await user.click(customTab);

      const urlInput = await screen.findByTestId("menu-picker-custom-url");
      const labelInput = await screen.findByTestId("menu-picker-custom-label");
      const addButton = await screen.findByTestId("menu-picker-custom-add");

      await user.type(urlInput, "/contact");
      await user.type(labelInput, "Contact");
      await user.click(addButton);

      // The new item appears in the list with the typed label and no
      // RPC has been called yet (acceptance: "ready to save (no
      // immediate persistence)").
      const tree = await screen.findByTestId("menu-tree");
      expect(tree).toHaveTextContent("Contact");
      expect(findRpcCall("save")).toBeUndefined();
    });

    test("renders existing items as a flat list in DFS order with parent-depth indent", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 3, itemCount: 3 }],
        "locations/list": [],
        pickerTabs: [{ kind: "custom", tabLabel: "Custom URL" }],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 3,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "Home",
              resolved: okResolved("Home"),
              meta: { kind: "custom", url: "/" },
            },
            {
              id: 11,
              parentId: null,
              sortOrder: 1,
              title: "About",
              resolved: okResolved("About"),
              meta: { kind: "custom", url: "/about" },
            },
            {
              id: 20,
              parentId: 11,
              sortOrder: 0,
              title: "Team",
              resolved: okResolved("Team"),
              meta: { kind: "custom", url: "/about/team" },
            },
          ],
        },
      });

      renderShell();

      // Each row has data-testid `menu-item-row-${id}` with a depth attr
      // so the flat-list interim still communicates hierarchy via indent.
      const home = await screen.findByTestId("menu-item-row-10");
      expect(home.dataset.depth).toBe("0");
      const about = await screen.findByTestId("menu-item-row-11");
      expect(about.dataset.depth).toBe("0");
      const team = await screen.findByTestId("menu-item-row-20");
      expect(team.dataset.depth).toBe("1");
    });

    test("when ?menu=<slug> resolves to a known menu, calls menu.get for its termId", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 3, itemCount: 0 }],
        "locations/list": [],
        pickerTabs: [{ kind: "custom", tabLabel: "Custom URL" }],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 3,
          maxDepth: 5,
          items: [],
        },
      });

      renderShell();

      const getCall = await vi.waitFor(() => {
        const found = findRpcCall("get");
        if (!found) throw new Error("menu.get not called");
        return found;
      });
      const input = parseRpcInput<{ termId: number }>(getCall);
      expect(input.termId).toBe(7);
      expect(
        await screen.findByTestId("menu-item-list-empty"),
      ).toBeInTheDocument();
    });
  });

  describe("broken-ref handling", () => {
    test("renders broken items with a warning, Re-link, and Convert-to-Custom buttons", async () => {
      // Slice 11: server enriches each item with `resolved.state`. The
      // editor renders broken rows distinctly and offers inline actions
      // — Re-link opens the picker in re-link mode, Convert rewrites
      // meta.kind to 'custom' seeded with the last-known href.
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 1, itemCount: 1 }],
        "locations/list": [],
        pickerTabs: [{ kind: "custom", tabLabel: "Custom URL" }],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 30,
              parentId: null,
              sortOrder: 0,
              title: "",
              meta: {
                kind: "entry",
                entryId: 99999,
                lastLabel: "Old About",
                lastHref: "/about-old",
              },
              resolved: {
                state: "broken",
                label: "Old About",
                href: "/about-old",
                lastHref: "/about-old",
              },
            },
          ],
        },
        save: {
          termId: 7,
          version: 2,
          itemIds: [30],
          added: [],
          removed: [],
          modified: [30],
        },
      });

      renderShell();
      const user = userEvent.setup();

      const row = await screen.findByTestId("menu-item-row-30");
      expect(row.dataset.state).toBe("broken");
      expect(
        await screen.findByTestId("menu-item-warning-30"),
      ).toBeInTheDocument();
      expect(row).toHaveTextContent("Old About");

      // Convert action seeds custom URL with the last-known href.
      await user.click(await screen.findByTestId("menu-item-convert-30"));
      await user.click(await screen.findByTestId("menu-save-button"));

      const call = await vi.waitFor(() => {
        const found = findRpcCall("save");
        if (!found) throw new Error("menu.save not called");
        return found;
      });
      const payload = parseRpcInput<{
        items: readonly { meta: { kind: string; url?: string } }[];
      }>(call);
      expect(payload.items[0]?.meta).toEqual({
        kind: "custom",
        url: "/about-old",
      });
    });

    test("Re-link opens the picker in re-link mode and replacing dispatches relinkItem", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 1, itemCount: 1 }],
        "locations/list": [],
        pickerTabs: [{ kind: "custom", tabLabel: "Custom URL" }],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 30,
              parentId: null,
              sortOrder: 0,
              title: "",
              meta: {
                kind: "entry",
                entryId: 99999,
                lastLabel: "Old About",
                lastHref: "/about-old",
              },
              resolved: {
                state: "broken",
                label: "Old About",
                href: "/about-old",
                lastHref: "/about-old",
              },
            },
          ],
        },
        save: {
          termId: 7,
          version: 2,
          itemIds: [30],
          added: [],
          removed: [],
          modified: [30],
        },
      });

      renderShell();
      const user = userEvent.setup();

      await screen.findByTestId("menu-item-row-30");
      await user.click(await screen.findByTestId("menu-item-relink-30"));
      // Banner appears with the broken item's last-known label.
      const banner = await screen.findByTestId("menu-picker-relink-banner");
      expect(banner).toHaveTextContent("Old About");

      // The Custom URL panel's primary button now reads "Replace link".
      await user.click(await screen.findByTestId("menu-picker-tab-custom"));
      await user.type(
        await screen.findByTestId("menu-picker-custom-url"),
        "/about-new",
      );
      await user.click(await screen.findByTestId("menu-picker-custom-add"));

      // Save and assert the payload carries the new URL on the same id.
      await user.click(await screen.findByTestId("menu-save-button"));
      const call = await vi.waitFor(() => {
        const found = findRpcCall("save");
        if (!found) throw new Error("menu.save not called");
        return found;
      });
      const payload = parseRpcInput<{
        items: readonly { id?: number; meta: { kind: string; url?: string } }[];
      }>(call);
      expect(payload.items[0]?.id).toBe(30);
      expect(payload.items[0]?.meta).toEqual({
        kind: "custom",
        url: "/about-new",
      });
    });
    test("in re-link mode, choosing a term replaces the broken item's link and clears the banner", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc(
        {
          list: [
            { id: 7, slug: "main", name: "Main", version: 1, itemCount: 1 },
          ],
          "locations/list": [],
          pickerTabs: [
            { kind: "term", tabLabel: "Categories", target: "category" },
            { kind: "custom", tabLabel: "Custom URL" },
          ],
          get: {
            id: 7,
            slug: "main",
            name: "Main",
            version: 1,
            maxDepth: 5,
            items: [
              {
                id: 30,
                parentId: null,
                sortOrder: 0,
                title: "",
                meta: { kind: "term", termId: 404, lastLabel: "Old news" },
                resolved: {
                  state: "broken",
                  label: "Old news",
                  linkedLabel: "Old news",
                  href: null,
                  lastHref: null,
                },
              },
            ],
          },
          save: {
            termId: 7,
            version: 2,
            itemIds: [30],
            added: [],
            removed: [],
            modified: [30],
          },
        },
        {
          searchTargets: searchTargetsFrom({
            category: [{ id: "4", label: "Guides" }],
          }),
        },
      );

      renderShell();
      const user = userEvent.setup();

      const row = await screen.findByTestId("menu-item-row-30");
      expect(row).toHaveAttribute("data-state", "broken");
      await user.click(screen.getByTestId("menu-item-relink-30"));
      expect(
        await screen.findByTestId("menu-picker-relink-banner"),
      ).toHaveTextContent("Old news");

      await user.click(await screen.findByTestId("menu-picker-option-4"));

      expect(screen.queryByTestId("menu-picker-relink-banner")).toBeNull();
      expect(row).toHaveAttribute("data-state", "ok");
      expect(row).toHaveTextContent("Guides");

      await user.click(screen.getByTestId("menu-save-button"));
      const call = await vi.waitFor(() => {
        const found = findRpcCall("save");
        if (!found) throw new Error("menu.save not called");
        return found;
      });
      const payload = parseRpcInput<{
        items: readonly { id?: number; meta: JsonValue }[];
      }>(call);
      expect(payload.items[0]).toMatchObject({
        id: 30,
        meta: { kind: "term", termId: 4 },
      });
    });
  });

  describe("max-depth setting", () => {
    test("typing in the max-depth input updates the value the next save sends", async () => {
      // Acceptance: per-menu maxDepth surfaces in the settings panel and
      // round-trips through save. The reducer guards against lowering
      // below the deepest current item — fixture sits at depth 1 so a
      // bump to 3 is accepted.
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 1, itemCount: 2 }],
        "locations/list": [],
        pickerTabs: [{ kind: "custom", tabLabel: "Custom URL" }],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "Parent",
              resolved: okResolved("Parent"),
              meta: { kind: "custom", url: "/p" },
            },
            {
              id: 20,
              parentId: 10,
              sortOrder: 0,
              title: "Child",
              resolved: okResolved("Child"),
              meta: { kind: "custom", url: "/p/c" },
            },
          ],
        },
        save: {
          termId: 7,
          version: 2,
          itemIds: [10, 20],
          added: [],
          removed: [],
          modified: [],
        },
      });

      renderShell();
      const user = userEvent.setup();
      const input = await screen.findByTestId<HTMLInputElement>(
        "menu-settings-max-depth",
      );
      expect(input.value).toBe("5");
      // `<input type="number">` rejects setSelectionRange, which makes
      // userEvent's clear() racy under CI load — fall back to fireEvent
      // for the value swap so the typed digit replaces "5" instead of
      // appending to it.
      fireEvent.change(input, { target: { value: "3" } });
      await user.click(await screen.findByTestId("menu-save-button"));

      const call = await vi.waitFor(() => {
        const found = findRpcCall("save");
        if (!found) throw new Error("menu.save not called");
        return found;
      });
      const payload = parseRpcInput<{ maxDepth?: number }>(call);
      expect(payload.maxDepth).toBe(3);
    });

    test("typing a value below the deepest item shows an inline error and saves the accepted value", async () => {
      // Regression: the reducer no-ops `updateMaxDepth` below the
      // deepest-existing depth. Without an inline error the component
      // silently kept showing the rejected draft and let the user think
      // the change took — the save then sent the still-accepted value.
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        list: [{ id: 7, slug: "main", name: "Main", version: 1, itemCount: 2 }],
        "locations/list": [],
        pickerTabs: [{ kind: "custom", tabLabel: "Custom URL" }],
        get: {
          id: 7,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [
            {
              id: 10,
              parentId: null,
              sortOrder: 0,
              title: "Parent",
              resolved: okResolved("Parent"),
              meta: { kind: "custom", url: "/p" },
            },
            {
              id: 20,
              parentId: 10,
              sortOrder: 0,
              title: "Child",
              resolved: okResolved("Child"),
              meta: { kind: "custom", url: "/p/c" },
            },
          ],
        },
        save: {
          termId: 7,
          version: 2,
          itemIds: [10, 20],
          added: [],
          removed: [],
          modified: [],
        },
      });

      renderShell();
      const user = userEvent.setup();
      const input = await screen.findByTestId<HTMLInputElement>(
        "menu-settings-max-depth",
      );
      fireEvent.change(input, { target: { value: "0" } });
      // Items have a depth-1 child, so 0 is rejected by the reducer.
      const error = await screen.findByTestId("menu-settings-max-depth-error");
      expect(error).toBeInTheDocument();

      await user.click(await screen.findByTestId("menu-save-button"));

      const call = await vi.waitFor(() => {
        const found = findRpcCall("save");
        if (!found) throw new Error("menu.save not called");
        return found;
      });
      const payload = parseRpcInput<{ maxDepth?: number }>(call);
      expect(payload.maxDepth).toBe(5);
    });
  });

  describe("menu selector", () => {
    test("renders one option per menu plus the Create-new sentinel", async () => {
      mockRpc({
        list: [
          { id: 1, slug: "main", name: "Main", version: 1, itemCount: 3 },
          { id: 2, slug: "footer", name: "Footer", version: 1, itemCount: 2 },
        ],
        "locations/list": [],
      });
      renderShell();

      const selector = await screen.findByTestId("menus-selector");
      expect(selector).toBeInTheDocument();
      expect(
        screen.getByTestId("menus-selector-option-main"),
      ).toHaveTextContent("Main");
      expect(
        screen.getByTestId("menus-selector-option-footer"),
      ).toHaveTextContent("Footer");
      expect(
        screen.getByTestId("menus-selector-create-new"),
      ).toBeInTheDocument();
    });
  });
});
