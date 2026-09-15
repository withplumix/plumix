import type { ReactNode } from "react";
import { ORPCError } from "@orpc/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { PluginRpcError, stubPluginRpc } from "plumix/admin/test";
import { afterEach, describe, expect, test, vi } from "vitest";

import { lookupRpc, useMediaLabels } from "./rpc.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function wrapper({ children }: { readonly children: ReactNode }): ReactNode {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useMediaLabels", () => {
  test("resolves labels through the shared plugin RPC client", async () => {
    const stub = stubPluginRpc("lookup", {
      list: () => ({
        items: [{ id: "1", label: "cat.png" }],
      }),
    });

    const { result } = renderHook(() => useMediaLabels(["1"]), { wrapper });

    await waitFor(() => {
      expect(result.current.get("1")).toEqual({ id: "1", label: "cat.png" });
    });
    expect(stub.lastCallTo("list")?.input).toEqual({
      kind: "media",
      ids: ["1"],
    });
  });
});

describe("lookupRpc", () => {
  test("a failed lookup throws the real ORPCError, not a re-derived Error", async () => {
    stubPluginRpc("lookup", {
      list: () => {
        throw new PluginRpcError("FORBIDDEN", { status: 403 });
      },
    });

    let caught: unknown;
    try {
      await lookupRpc.list({ kind: "media", ids: ["1"] });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ORPCError);
    expect((caught as InstanceType<typeof ORPCError>).code).toBe("FORBIDDEN");
  });
});
