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

function mockRpc(routes: Record<string, unknown>): void {
  fetchMock = vi.fn((input: RequestInfo | URL): Promise<Response> => {
    const url = urlOf(input);
    for (const [suffix, body] of Object.entries(routes)) {
      if (url.endsWith(suffix)) {
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
