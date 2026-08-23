import { act } from "@testing-library/react";
import { vi } from "vitest";

/** One RPC request the admin client sent, decoded from the wire envelope. */
interface RpcCall {
  /** Slash-joined procedure path, e.g. `"lookup/list"`. */
  readonly procedure: string;
  readonly input: unknown;
}

/**
 * Produces the procedure's result. Throwing responds with a 500, which the
 * client surfaces to the caller as a rejected query.
 */
type RpcResponder = (input: unknown) => unknown;

export interface RpcStub {
  /** Every request the client sent, in order. */
  readonly calls: readonly RpcCall[];
  readonly lastCallTo: (procedure: string) => RpcCall | undefined;
}

const RPC_PREFIX = "/_plumix/rpc/";

function envelope(body: unknown, status: number): Response {
  // StandardRPC's wire shape. `meta` carries type hints for values JSON can't
  // represent; nothing these tests return needs one.
  return new Response(JSON.stringify({ json: body, meta: [] }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Serve the admin's oRPC client from the test instead of the network, by
 * substituting `fetch` — the platform boundary the real client already calls
 * through. The client, its links and its query-key generation all run for
 * real, so a change to how a hook assembles its input shows up in `calls`.
 *
 * Routes are keyed by procedure path: `{ "lookup/list": () => ({ items: [] }) }`.
 * An unrouted procedure answers 404, so a test can't pass by accident on a
 * call it never declared.
 */
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

export function stubRpc(
  routes: Readonly<Record<string, RpcResponder>>,
): RpcStub {
  const calls: RpcCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request): Promise<Response> => {
      const { pathname } = new URL(request.url);
      const prefixAt = pathname.indexOf(RPC_PREFIX);
      if (prefixAt === -1) return envelope({ message: "not rpc" }, 404);
      const procedure = pathname.slice(prefixAt + RPC_PREFIX.length);
      const { json: input } = (await request.json()) as { json: unknown };
      // Recorded before the route lookup, so an unrouted procedure shows up in
      // `calls` rather than only in a 404 nobody asserts on.
      calls.push({ procedure, input });
      const responder = routes[procedure];
      if (!responder) return envelope({ message: "not routed" }, 404);
      try {
        return envelope(await responder(input), 200);
      } catch {
        // The thrown value isn't echoed back: what a responder threw is
        // already visible in the test that threw it, and the tests using this
        // path assert on the failure, not on its message.
        return envelope({ message: "responder threw" }, 500);
      }
    }),
  );
  return {
    calls,
    lastCallTo: (procedure) =>
      calls.filter((call) => call.procedure === procedure).at(-1),
  };
}
