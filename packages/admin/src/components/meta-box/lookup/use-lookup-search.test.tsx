import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { LookupItem } from "./types.js";

// Control the `lookup.list` RPC from the test: `queryOptions` returns a
// queryFn that defers to `listMock`, so each test scripts the response
// and inspects the exact `input` the hook assembled.
const listMock = vi.fn<(input: unknown) => Promise<{ items: LookupItem[] }>>();
vi.mock("@/lib/orpc.js", () => ({
  orpc: {
    lookup: {
      list: {
        queryOptions: ({ input }: { readonly input: unknown }) => ({
          queryKey: ["lookup.list", input],
          queryFn: () => listMock(input),
        }),
      },
    },
  },
}));

// Imported after the mock so the hook's `orpc` binding is the stub.
const { useLookupSearch } = await import("./use-lookup-search.js");

function wrapper({ children }: { children: ReactNode }): ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  listMock.mockResolvedValue({ items: [] });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("useLookupSearch", () => {
  test("does not fetch while disabled", () => {
    const { result } = renderHook(
      () => useLookupSearch({ kind: "user", enabled: false }),
      { wrapper },
    );
    expect(listMock).not.toHaveBeenCalled();
    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  test("fetches when enabled and exposes the returned items", async () => {
    const rows: LookupItem[] = [{ id: "1", label: "Ada" }];
    listMock.mockResolvedValue({ items: rows });
    const { result } = renderHook(
      () =>
        useLookupSearch({
          kind: "user",
          scope: { roles: ["admin"] },
          enabled: true,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.items).toEqual(rows));
    expect(listMock).toHaveBeenCalledWith({
      kind: "user",
      query: undefined,
      scope: { roles: ["admin"] },
      limit: 20,
    });
  });

  test("trims the query and drops a blank one to undefined", async () => {
    const { result } = renderHook(
      () => useLookupSearch({ kind: "entry", enabled: true }),
      { wrapper },
    );
    await waitFor(() => expect(listMock).toHaveBeenCalled());

    act(() => {
      result.current.setQuery("  hello  ");
    });
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: "hello" }),
      ),
    );
    expect(result.current.query).toBe("  hello  ");

    act(() => {
      result.current.setQuery("   ");
    });
    await waitFor(() =>
      expect(listMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ query: undefined }),
      ),
    );
  });
});
