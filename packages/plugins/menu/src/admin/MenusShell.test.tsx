import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { MenusShell } from "./MenusShell.js";

type FetchCall = readonly [input: RequestInfo | URL, init?: RequestInit];

let fetchMock: ReturnType<
  typeof vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >
>;

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

interface ErrorResponse {
  readonly status: number;
  readonly error: {
    readonly message?: string;
    readonly data?: { reason?: string };
  };
}
function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    "error" in value
  );
}

function mockRpc(routes: Record<string, unknown>): void {
  fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
    const url = urlOf(input);
    for (const [suffix, body] of Object.entries(routes)) {
      if (url.endsWith(suffix)) {
        if (isErrorResponse(body)) {
          return Promise.resolve(
            new Response(JSON.stringify({ json: body.error, meta: [] }), {
              status: body.status,
              headers: { "content-type": "application/json" },
            }),
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ json: body, meta: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }
    }
    return Promise.resolve(new Response("not-mocked", { status: 404 }));
  });
  vi.stubGlobal("fetch", fetchMock);
}

function findRpcCall(suffix: string): FetchCall | undefined {
  return fetchMock.mock.calls.find((call) => {
    const url = call[0];
    return typeof url === "string" && url.endsWith(suffix);
  });
}

function parseRpcInput<T>(call: FetchCall): T {
  const init = call[1];
  const body = init?.body;
  if (typeof body !== "string") {
    throw new Error("expected request body to be a JSON string");
  }
  return (JSON.parse(body) as { json: T }).json;
}

function renderShell(): void {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { readonly children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
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

  describe("empty state", () => {
    test("renders the create-first-menu CTA when no menus exist", async () => {
      mockRpc({
        "/menu/list": [],
        "/menu/locations/list": [],
      });
      renderShell();

      const cta = await screen.findByTestId("menus-empty-cta");
      expect(cta).toBeInTheDocument();
    });
  });

  describe("create flow", () => {
    test("clicking + Create new menu prompts and calls menu.save with empty items", async () => {
      mockRpc({
        "/menu/list": [],
        "/menu/locations/list": [],
        "/menu/create": {
          termId: 99,
          slug: "header-nav",
          version: 1,
        },
      });
      vi.stubGlobal("prompt", vi.fn().mockReturnValue("Header Nav"));

      renderShell();
      const user = userEvent.setup();
      await user.click(await screen.findByTestId("menus-selector-create-new"));

      const createCall = await vi.waitFor(() => {
        const found = findRpcCall("/menu/create");
        if (!found) throw new Error("menu.create not called yet");
        return found;
      });
      const input = parseRpcInput<{ name: string }>(createCall);
      expect(input.name).toBe("Header Nav");
      await vi.waitFor(() =>
        expect(window.location.search).toMatch(/[?&]menu=header-nav\b/),
      );
    });

    test("dismissing the prompt is a no-op", async () => {
      mockRpc({
        "/menu/list": [],
        "/menu/locations/list": [],
      });
      vi.stubGlobal("prompt", vi.fn().mockReturnValue(null));

      renderShell();
      const user = userEvent.setup();
      await user.click(await screen.findByTestId("menus-selector-create-new"));

      expect(findRpcCall("/menu/create")).toBeUndefined();
    });
  });

  describe("tabs", () => {
    test("defaults to the edit tab when ?tab= is absent", async () => {
      mockRpc({
        "/menu/list": [
          { id: 1, slug: "main", name: "Main", version: 1, itemCount: 0 },
        ],
        "/menu/locations/list": [],
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
        "/menu/list": [
          { id: 1, slug: "main", name: "Main", version: 1, itemCount: 0 },
        ],
        "/menu/locations/list": [],
      });

      renderShell();

      expect(
        await screen.findByTestId("menus-tab-locations-panel"),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("menus-tab-edit-panel")).toBeNull();
    });

    test("clicking a tab updates the query param and swaps panels", async () => {
      mockRpc({
        "/menu/list": [
          { id: 1, slug: "main", name: "Main", version: 1, itemCount: 0 },
        ],
        "/menu/locations/list": [],
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
        "/menu/list": [
          { id: 1, slug: "main", name: "Main", version: 1, itemCount: 0 },
          { id: 2, slug: "footer", name: "Footer", version: 1, itemCount: 0 },
        ],
        "/menu/locations/list": [
          { id: "footer", label: "Footer Slot", boundTermId: null },
          { id: "primary", label: "Primary Nav", boundTermId: 1 },
        ],
      });

      renderShell();

      const primarySelect = await screen.findByTestId<HTMLSelectElement>(
        "menus-location-select-primary",
      );
      expect(primarySelect).toBeInTheDocument();
      expect(primarySelect.value).toBe("main");

      const footerSelect = await screen.findByTestId<HTMLSelectElement>(
        "menus-location-select-footer",
      );
      expect(footerSelect.value).toBe("");
    });

    test("changing a select calls menu.assignLocation with the new termSlug", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?tab=locations",
      );
      mockRpc({
        "/menu/list": [
          { id: 1, slug: "main", name: "Main", version: 1, itemCount: 0 },
          { id: 2, slug: "footer", name: "Footer", version: 1, itemCount: 0 },
        ],
        "/menu/locations/list": [
          { id: "primary", label: "Primary Nav", boundTermId: null },
        ],
        "/menu/assignLocation": { location: "primary", termSlug: "main" },
      });

      renderShell();
      const select = await screen.findByTestId<HTMLSelectElement>(
        "menus-location-select-primary",
      );
      const user = userEvent.setup();
      await user.selectOptions(select, "main");

      const call = await vi.waitFor(() => {
        const found = findRpcCall("/menu/assignLocation");
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
        "/menu/list": [
          { id: 1, slug: "main", name: "Main", version: 1, itemCount: 0 },
        ],
        "/menu/locations/list": [
          { id: "primary", label: "Primary Nav", boundTermId: 1 },
        ],
        "/menu/assignLocation": { location: "primary", termSlug: null },
      });

      renderShell();
      const select = await screen.findByTestId<HTMLSelectElement>(
        "menus-location-select-primary",
      );
      const user = userEvent.setup();
      await user.selectOptions(select, "");

      const call = await vi.waitFor(() => {
        const found = findRpcCall("/menu/assignLocation");
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
      const fetchImpl = vi.fn((input: RequestInfo | URL): Promise<Response> => {
        const url = typeof input === "string" ? input : (input as URL).href;
        if (url.endsWith("/menu/list")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                json: [
                  {
                    id: 7,
                    slug: "main",
                    name: "Main",
                    version: 1,
                    itemCount: 0,
                  },
                ],
                meta: [],
              }),
              { status: 200 },
            ),
          );
        }
        if (url.endsWith("/menu/locations/list")) {
          return Promise.resolve(
            new Response(JSON.stringify({ json: [], meta: [] }), {
              status: 200,
            }),
          );
        }
        if (url.endsWith("/menu/pickerTabs")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                json: [{ kind: "custom", tabLabel: "Custom URL" }],
                meta: [],
              }),
              { status: 200 },
            ),
          );
        }
        if (url.endsWith("/menu/get")) {
          getCallCount += 1;
          // First fetch returns v1 (editor's starting point); after the
          // user clicks Reload, refetch returns v2 with a fresh item —
          // so the test can assert state actually mirrored the new
          // server data.
          const body =
            getCallCount === 1
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
                      meta: { kind: "custom", url: "/r" },
                    },
                  ],
                };
          return Promise.resolve(
            new Response(JSON.stringify({ json: body, meta: [] }), {
              status: 200,
            }),
          );
        }
        if (url.endsWith("/menu/save")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                json: {
                  message: "concurrent edit",
                  data: { reason: "version_mismatch", key: "1" },
                },
                meta: [],
              }),
              { status: 409 },
            ),
          );
        }
        return Promise.resolve(new Response("not-mocked", { status: 404 }));
      });
      vi.stubGlobal("fetch", fetchImpl);

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
    });

    test("Save button posts current items + version to menu.save", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        "/menu/list": [
          { id: 7, slug: "main", name: "Main", version: 4, itemCount: 0 },
        ],
        "/menu/locations/list": [],
        "/menu/pickerTabs": [{ kind: "custom", tabLabel: "Custom URL" }],
        "/menu/get": {
          id: 7,
          slug: "main",
          name: "Main",
          version: 4,
          maxDepth: 5,
          items: [],
        },
        "/menu/save": {
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
        const found = findRpcCall("/menu/save");
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
        "/menu/list": [
          { id: 7, slug: "main", name: "Main", version: 1, itemCount: 0 },
        ],
        "/menu/locations/list": [],
        "/menu/pickerTabs": [{ kind: "custom", tabLabel: "Custom URL" }],
        "/menu/get": {
          id: 7,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [],
        },
        "/menu/delete": { id: 7 },
      });
      vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));

      renderShell();
      const user = userEvent.setup();
      await user.click(await screen.findByTestId("menu-delete-button"));

      const call = await vi.waitFor(() => {
        const found = findRpcCall("/menu/delete");
        if (!found) throw new Error("menu.delete not called");
        return found;
      });
      const input = parseRpcInput<{ termId: number }>(call);
      expect(input.termId).toBe(7);
    });

    test("settings panel location checkboxes reflect bindings and toggle via menu.assignLocation", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        "/menu/list": [
          { id: 7, slug: "main", name: "Main", version: 1, itemCount: 0 },
        ],
        "/menu/locations/list": [
          { id: "primary", label: "Primary Nav", boundTermId: 7 },
          { id: "footer", label: "Footer Slot", boundTermId: null },
        ],
        "/menu/pickerTabs": [{ kind: "custom", tabLabel: "Custom URL" }],
        "/menu/get": {
          id: 7,
          slug: "main",
          name: "Main",
          version: 1,
          maxDepth: 5,
          items: [],
        },
        "/menu/assignLocation": { location: "footer", termSlug: "main" },
      });

      renderShell();

      const primary = await screen.findByTestId<HTMLInputElement>(
        "menu-settings-location-primary",
      );
      expect(primary.checked).toBe(true);

      const footer = await screen.findByTestId<HTMLInputElement>(
        "menu-settings-location-footer",
      );
      expect(footer.checked).toBe(false);

      const user = userEvent.setup();
      await user.click(footer);

      const call = await vi.waitFor(() => {
        const found = findRpcCall("/menu/assignLocation");
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
        "/menu/list": [
          { id: 7, slug: "main", name: "Main", version: 1, itemCount: 1 },
        ],
        "/menu/locations/list": [],
        "/menu/pickerTabs": [{ kind: "custom", tabLabel: "Custom URL" }],
        "/menu/get": {
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
              meta: { kind: "custom", url: "/" },
            },
          ],
        },
        "/menu/save": {
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
        const found = findRpcCall("/menu/save");
        if (!found) throw new Error("menu.save not called");
        return found;
      });
      const input = parseRpcInput<{
        items: readonly { id?: number; title: string | null }[];
      }>(call);
      expect(input.items[0]?.id).toBe(99);
      expect(input.items[0]?.title).toBeNull();
    });

    test("custom URL picker tab adds a new item to the in-memory list", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        "/menu/list": [
          { id: 7, slug: "main", name: "Main", version: 1, itemCount: 0 },
        ],
        "/menu/locations/list": [],
        "/menu/pickerTabs": [{ kind: "custom", tabLabel: "Custom URL" }],
        "/menu/get": {
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
      expect(findRpcCall("/menu/save")).toBeUndefined();
    });

    test("renders existing items as a flat list in DFS order with parent-depth indent", async () => {
      window.history.replaceState(
        {},
        "",
        "/_plumix/admin/pages/menus?menu=main",
      );
      mockRpc({
        "/menu/list": [
          { id: 7, slug: "main", name: "Main", version: 3, itemCount: 3 },
        ],
        "/menu/locations/list": [],
        "/menu/pickerTabs": [{ kind: "custom", tabLabel: "Custom URL" }],
        "/menu/get": {
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
              meta: { kind: "custom", url: "/" },
            },
            {
              id: 11,
              parentId: null,
              sortOrder: 1,
              title: "About",
              meta: { kind: "custom", url: "/about" },
            },
            {
              id: 20,
              parentId: 11,
              sortOrder: 0,
              title: "Team",
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
        "/menu/list": [
          { id: 7, slug: "main", name: "Main", version: 3, itemCount: 0 },
        ],
        "/menu/locations/list": [],
        "/menu/pickerTabs": [{ kind: "custom", tabLabel: "Custom URL" }],
        "/menu/get": {
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
        const found = findRpcCall("/menu/get");
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
        "/menu/list": [
          { id: 7, slug: "main", name: "Main", version: 1, itemCount: 2 },
        ],
        "/menu/locations/list": [],
        "/menu/pickerTabs": [{ kind: "custom", tabLabel: "Custom URL" }],
        "/menu/get": {
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
              meta: { kind: "custom", url: "/p" },
            },
            {
              id: 20,
              parentId: 10,
              sortOrder: 0,
              title: "Child",
              meta: { kind: "custom", url: "/p/c" },
            },
          ],
        },
        "/menu/save": {
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
      await user.clear(input);
      await user.type(input, "3");
      await user.click(await screen.findByTestId("menu-save-button"));

      const call = await vi.waitFor(() => {
        const found = findRpcCall("/menu/save");
        if (!found) throw new Error("menu.save not called");
        return found;
      });
      const payload = parseRpcInput<{ maxDepth?: number }>(call);
      expect(payload.maxDepth).toBe(3);
    });
  });

  describe("menu selector", () => {
    test("renders one option per menu plus the Create-new sentinel", async () => {
      mockRpc({
        "/menu/list": [
          { id: 1, slug: "main", name: "Main", version: 1, itemCount: 3 },
          { id: 2, slug: "footer", name: "Footer", version: 1, itemCount: 2 },
        ],
        "/menu/locations/list": [],
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
