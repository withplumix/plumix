import { act } from "@testing-library/react";

import type { AppRouter } from "@plumix/core";
import type {
  RpcStub as CoreRpcStub,
  RpcStubRoutes,
} from "@plumix/core/test/browser";
import { stubRpcEndpoint } from "@plumix/core/test/browser";

/**
 * A query is several awaits from its fetch, so asserting `calls` is empty
 * without this passes whether or not the request was made.
 */
export async function settleRpc(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export type RpcStub = CoreRpcStub<AppRouter>;

/**
 * Substitutes `fetch`, so the real client, links and query keys all run. An
 * unrouted procedure answers 404, so a test can't pass on an undeclared call.
 */
export function stubRpc(routes: RpcStubRoutes<AppRouter>): RpcStub {
  return stubRpcEndpoint<AppRouter>({
    prefix: "/_plumix/rpc",
    routes,
    unservedHint:
      "stubRpc answers the admin's own RPC client, so a test making any other request stubs it separately.",
  });
}
