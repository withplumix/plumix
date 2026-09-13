// Test-only counterpart to `createPluginRpcClient` (see `./plugin-rpc.js`):
// serve a plugin's RPC procedures from the test instead of the network, by
// substituting `fetch` — the platform boundary the real client already calls
// through. Every plugin admin shell test used to hand-roll this (URL-suffix
// matching, envelope construction, error-body shape) independently; this is
// the one copy.

import { vi } from "vitest";

import type { JsonValue } from "@plumix/core";

/** One RPC request the client sent, decoded from the wire envelope. */
export interface PluginRpcCall {
  /** The procedure path under the plugin's own namespace, e.g. `"locations/list"`. */
  readonly procedure: string;
  readonly input: unknown;
}

/**
 * Produces the procedure's result — the serializable value the wire envelope
 * carries. Throwing a `PluginRpcError` responds with that error's status and
 * code/data, matching what a real `errors.XXX({data})` throw on the server
 * produces; throwing anything else responds with a 500.
 */
type PluginRpcResponder = (input: unknown) => JsonValue | Promise<JsonValue>;

export interface PluginRpcStub {
  /** Every request the client sent, in order. */
  readonly calls: readonly PluginRpcCall[];
  readonly lastCallTo: (procedure: string) => PluginRpcCall | undefined;
}

/**
 * Throw from a route responder to answer with a specific oRPC error shape —
 * e.g. the CONFLICT a version-mismatch save returns — instead of the generic
 * 500 an unannotated throw produces.
 */
export class PluginRpcError extends Error {
  readonly code: string;
  readonly status: number;
  readonly data: unknown;

  constructor(
    code: string,
    options: {
      readonly message?: string;
      readonly status?: number;
      readonly data?: unknown;
    } = {},
  ) {
    super(options.message ?? code);
    this.code = code;
    this.status = options.status ?? 500;
    this.data = options.data;
  }
}

function envelope(body: unknown, status: number): Response {
  // StandardRPC's wire shape. `meta` carries type hints for values JSON can't
  // represent; nothing these tests return needs one.
  return new Response(JSON.stringify({ json: body, meta: [] }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorEnvelope(error: PluginRpcError): Response {
  return envelope(
    {
      defined: false,
      code: error.code,
      status: error.status,
      message: error.message,
      data: error.data,
    },
    error.status,
  );
}

/**
 * Routes are keyed by procedure path under the plugin's own namespace:
 * `{ "locations/list": () => [] }` for a plugin id of `"menu"`. An unrouted
 * procedure answers 404, so a test can't pass by accident on a call it never
 * declared.
 */
export function stubPluginRpc(
  pluginId: string,
  routes: Readonly<Record<string, PluginRpcResponder>>,
): PluginRpcStub {
  const prefix = `/_plumix/rpc/${pluginId}/`;
  const calls: PluginRpcCall[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (request: Request): Promise<Response> => {
      const { pathname } = new URL(request.url);
      const prefixAt = pathname.indexOf(prefix);
      if (prefixAt === -1) return envelope({ message: "not rpc" }, 404);
      const procedure = pathname.slice(prefixAt + prefix.length);
      const { json: input } = (await request.json()) as { json?: unknown };
      // Recorded before the route lookup, so an unrouted procedure shows up
      // in `calls` rather than only in a 404 nobody asserts on.
      calls.push({ procedure, input });
      const responder = routes[procedure];
      if (!responder) return envelope({ message: "not routed" }, 404);
      try {
        return envelope(await responder(input), 200);
      } catch (error) {
        if (error instanceof PluginRpcError) return errorEnvelope(error);
        // The thrown value isn't echoed back: what a responder threw is
        // already visible in the test that threw it.
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
