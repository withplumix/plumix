import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import type { RpcStub } from "../../../../test/rpc.js";
import type { LookupItem } from "./types.js";
import { settleRpc, stubRpc } from "../../../../test/rpc.js";
import { useReferenceResolve } from "./use-reference-resolve.js";

// Resolve is a batched `lookup.list` call keyed on `ids`. The stub answers at
// the fetch boundary with whichever rows exist (orphans simply don't), leaving
// the real client to assemble and send the `ids` the hook asked for.
function stubResolve(items: readonly LookupItem[] = []): RpcStub {
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

describe("useReferenceResolve", () => {
  test("short-circuits fully-hydrated ids without a resolve round-trip", async () => {
    const rpc = stubResolve();
    const { result } = renderHook(
      () =>
        useReferenceResolve({
          kind: "user",
          ids: ["1", "2"],
          initialSelected: [
            { id: "1", label: "Ada" },
            { id: "2", label: "Bo" },
          ],
        }),
      { wrapper },
    );
    await settleRpc();
    expect(rpc.calls).toEqual([]);
    expect(result.current.statusOf("1")).toEqual({
      status: "found",
      item: { id: "1", label: "Ada" },
    });
    expect(result.current.isError).toBe(false);
  });

  test("resolves un-hydrated ids and marks missing rows as orphans", async () => {
    const rpc = stubResolve([{ id: "1", label: "Ada" }]);
    const { result } = renderHook(
      () => useReferenceResolve({ kind: "user", ids: ["1", "2"] }),
      { wrapper },
    );
    // In flight → every row is pending, never a premature "orphan".
    expect(result.current.statusOf("1").status).toBe("pending");

    await waitFor(() => {
      expect(result.current.statusOf("1")).toEqual({
        status: "found",
        item: { id: "1", label: "Ada" },
      });
    });
    expect(result.current.statusOf("2")).toEqual({ status: "orphan" });
    expect(rpc.lastCallTo("lookup/list")?.input).toEqual({
      kind: "user",
      ids: ["1", "2"],
    });
  });

  test("hydrated prefill covers some ids while the rest resolve", async () => {
    stubResolve([{ id: "2", label: "Bo" }]);
    const { result } = renderHook(
      () =>
        useReferenceResolve({
          kind: "user",
          ids: ["1", "2"],
          initialSelected: [{ id: "1", label: "Ada" }],
        }),
      { wrapper },
    );
    // Not all prefilled → a resolve runs for the batch.
    await waitFor(() => {
      expect(result.current.statusOf("2")).toEqual({
        status: "found",
        item: { id: "2", label: "Bo" },
      });
    });
    expect(result.current.statusOf("1")).toEqual({
      status: "found",
      item: { id: "1", label: "Ada" },
    });
  });

  test("surfaces a resolve failure via isError (rows fall to orphan)", async () => {
    stubRpc({
      "lookup/list": () => {
        throw new Error("network");
      },
    });
    const { result } = renderHook(
      () => useReferenceResolve({ kind: "user", ids: ["1"] }),
      { wrapper },
    );
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.statusOf("1")).toEqual({ status: "orphan" });
  });

  test("does not fetch for an empty selection", async () => {
    const rpc = stubResolve();
    const { result } = renderHook(
      () => useReferenceResolve({ kind: "user", ids: [] }),
      { wrapper },
    );
    await settleRpc();
    expect(rpc.calls).toEqual([]);
    expect(result.current.isError).toBe(false);
  });
});
