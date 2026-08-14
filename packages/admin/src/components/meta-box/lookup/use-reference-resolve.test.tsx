import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { LookupItem } from "./types.js";

// Resolve is a batched `lookup.list` call keyed on `ids`; the mock lets each
// test script which rows come back (orphans simply don't) and inspect the
// `ids` the hook sent.
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

const { useReferenceResolve } = await import("./use-reference-resolve.js");

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

describe("useReferenceResolve", () => {
  test("short-circuits fully-hydrated ids without a resolve round-trip", () => {
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
    expect(listMock).not.toHaveBeenCalled();
    expect(result.current.statusOf("1")).toEqual({
      status: "found",
      item: { id: "1", label: "Ada" },
    });
    expect(result.current.isError).toBe(false);
  });

  test("resolves un-hydrated ids and marks missing rows as orphans", async () => {
    listMock.mockResolvedValue({ items: [{ id: "1", label: "Ada" }] });
    const { result } = renderHook(
      () => useReferenceResolve({ kind: "user", ids: ["1", "2"] }),
      { wrapper },
    );
    // In flight → every row is pending, never a premature "orphan".
    expect(result.current.statusOf("1").status).toBe("pending");

    await waitFor(() =>
      expect(result.current.statusOf("1")).toEqual({
        status: "found",
        item: { id: "1", label: "Ada" },
      }),
    );
    expect(result.current.statusOf("2")).toEqual({ status: "orphan" });
    expect(listMock).toHaveBeenCalledWith({
      kind: "user",
      scope: undefined,
      ids: ["1", "2"],
    });
  });

  test("hydrated prefill covers some ids while the rest resolve", async () => {
    listMock.mockResolvedValue({ items: [{ id: "2", label: "Bo" }] });
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
    await waitFor(() =>
      expect(result.current.statusOf("2")).toEqual({
        status: "found",
        item: { id: "2", label: "Bo" },
      }),
    );
    expect(result.current.statusOf("1")).toEqual({
      status: "found",
      item: { id: "1", label: "Ada" },
    });
  });

  test("surfaces a resolve failure via isError (rows fall to orphan)", async () => {
    listMock.mockRejectedValue(new Error("network"));
    const { result } = renderHook(
      () => useReferenceResolve({ kind: "user", ids: ["1"] }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.statusOf("1")).toEqual({ status: "orphan" });
  });

  test("does not fetch for an empty selection", () => {
    const { result } = renderHook(
      () => useReferenceResolve({ kind: "user", ids: [] }),
      { wrapper },
    );
    expect(listMock).not.toHaveBeenCalled();
    expect(result.current.isError).toBe(false);
  });
});
