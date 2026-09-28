import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { RpcStub } from "../../../../test/rpc.js";
import type { LookupItem } from "./types.js";
import { settleRpc, stubRpc } from "../../../../test/rpc.js";
import { useLookupSearch } from "./use-lookup-search.js";

// The hook talks to `lookup.list` through the admin's real oRPC client; the
// stub answers at the fetch boundary, so `rpc.calls` holds the exact input the
// hook assembled and put on the wire.
function stubLookup(items: readonly LookupItem[] = []): RpcStub {
  return stubRpc({ "lookup/list": () => ({ items }) });
}

function wrapper({ children }: { children: ReactNode }): ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useLookupSearch", () => {
  test("does not fetch while disabled", async () => {
    const rpc = stubLookup();
    const { result } = renderHook(
      () => useLookupSearch({ kind: "user", enabled: false }),
      { wrapper },
    );
    await settleRpc();
    expect(rpc.calls).toEqual([]);
    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  test("fetches when enabled and exposes the returned items", async () => {
    const rows: LookupItem[] = [{ id: "1", label: "Ada" }];
    const rpc = stubLookup(rows);
    const { result } = renderHook(
      () =>
        useLookupSearch({
          kind: "user",
          scope: { roles: ["admin"] },
          enabled: true,
        }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.items).toEqual(rows);
    });
    expect(rpc.lastCallTo("lookup/list")?.input).toEqual({
      kind: "user",
      scope: { roles: ["admin"] },
      limit: 20,
    });
  });

  test("trims the query and drops a blank one to undefined", async () => {
    const rpc = stubLookup();
    const { result } = renderHook(
      () => useLookupSearch({ kind: "entry", enabled: true }),
      { wrapper },
    );
    await waitFor(() => {
      expect(rpc.calls.length).toBe(1);
    });

    act(() => {
      result.current.setQuery("  hello  ");
    });
    await waitFor(() => {
      expect(rpc.lastCallTo("lookup/list")?.input).toMatchObject({
        query: "hello",
      });
    });
    expect(result.current.query).toBe("  hello  ");

    act(() => {
      result.current.setQuery("   ");
    });
    await waitFor(() => {
      expect(rpc.calls.length).toBe(3);
    });
    expect(rpc.lastCallTo("lookup/list")?.input).toEqual({
      kind: "entry",
      limit: 20,
    });
  });
});
