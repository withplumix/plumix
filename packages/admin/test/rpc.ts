import { act } from "@testing-library/react";

import type { AppRouter } from "@plumix/core";
import type {
  RpcStub as CoreRpcStub,
  RpcStubRoutes,
} from "@plumix/core/test/browser";
import { stubRpcEndpoint } from "@plumix/core/test/browser";

/**
 * Let anything already dispatched reach the stub. A query is several awaits
 * away from its fetch, so asserting `calls` is empty without this passes
 * whether or not the request was made — which is exactly the assertion that
 * has to bite when a fetch gate is removed.
 */
export async function settleRpc(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export type RpcStub = CoreRpcStub<AppRouter>;

/**
 * Serve the admin's oRPC client from the test instead of the network, by
 * substituting `fetch` — the platform boundary the real client already calls
 * through. The client, its links and its query-key generation all run for
 * real, so a change to how a hook assembles its input shows up in `calls`.
 *
 * Routes are keyed by the core router's procedure paths and typed against it:
 * `{ "lookup/list": () => ({ items: [] }) }`. An unrouted procedure answers
 * 404, so a test can't pass by accident on a call it never declared.
 */
export function stubRpc(routes: RpcStubRoutes<AppRouter>): RpcStub {
  return stubRpcEndpoint<AppRouter>({
    prefix: "/_plumix/rpc",
    routes,
    unservedHint:
      "stubRpc answers the admin's own RPC client, so a test making any other request stubs it separately.",
  });
}
