// Test-only counterpart to `createPluginRpcClient` (see `./plugin-rpc.js`):
// serve a plugin's RPC procedures from the test instead of the network, by
// substituting `fetch` — the platform boundary the real client already calls
// through. Every plugin admin shell test used to hand-roll this (URL-suffix
// matching, envelope construction, error-body shape) independently; this is
// the one copy.
//
// Served by oRPC's own `RPCHandler` — the class the dispatcher builds the real
// merged router on — rather than by re-implementing the wire format here. Two
// hand-written copies of one protocol drift, and only someone reading both ever
// catches it: that is how the missing `meta` type hints (#2411) and the
// non-envelope error bodies (#2418) got in.

import { ORPCError } from "@orpc/client";
import {
  StandardRPCJsonSerializer,
  StandardRPCSerializer,
} from "@orpc/client/standard";
import { os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { toStandardBody } from "@orpc/standard-server-fetch";
import { vi } from "vitest";

import type { JsonValue } from "@plumix/core";
import { methodNotAllowed, notFoundResponse } from "@plumix/core";

/** One RPC request the client sent, decoded from the wire envelope. */
export interface PluginRpcCall {
  /** The procedure path under the plugin's own namespace, e.g. `"locations/list"`. */
  readonly procedure: string;
  readonly input: unknown;
}

/**
 * What a responder may hand back: plain JSON, plus every value
 * `StandardRPCJsonSerializer` encodes with a `meta` type hint, nested at any
 * depth — returning a `Date` here is the point, the client revives one.
 *
 * `undefined` is admitted at the top level because a procedure returning
 * nothing serializes exactly that way; the cost is that a responder missing its
 * `return` type-checks. A `Blob` switches the whole message to multipart
 * `FormData`, which the handler builds and parses as the server does.
 */
type PluginRpcValue =
  | JsonValue
  | Date
  | bigint
  | URL
  | RegExp
  | Blob
  | undefined
  | ReadonlySet<PluginRpcValue>
  | ReadonlyMap<PluginRpcValue, PluginRpcValue>
  | readonly PluginRpcValue[]
  | { readonly [key: string]: PluginRpcValue };

/**
 * Produces the procedure's result — the serializable value the wire envelope
 * carries. `input` arrives revived, as a real handler's would: a `Date` the
 * caller passed is a `Date` here, not its JSON projection, and a `Blob` is a
 * `Blob` read back out of the multipart body.
 *
 * Throwing a `PluginRpcError` responds with that error's status and
 * code/data, matching what a real `errors.XXX({data})` throw on the server
 * produces; throwing an `ORPCError` passes it through untouched; throwing
 * anything else responds with the handler's own 500.
 */
type PluginRpcResponder = (
  input: unknown,
) => PluginRpcValue | Promise<PluginRpcValue>;

export interface PluginRpcStub {
  /** Every request the client sent, in order. */
  readonly calls: readonly PluginRpcCall[];
  readonly lastCallTo: (procedure: string) => PluginRpcCall | undefined;
}

/**
 * Throw from a route responder to answer with a specific oRPC error shape —
 * e.g. the CONFLICT a version-mismatch save returns — instead of the generic
 * 500 an unannotated throw produces.
 *
 * `status` has to be one an error envelope can carry: below 200 or 400 and up.
 * The protocol has no way to express a 2xx/3xx failure, so one given here
 * cannot reach the client and answers 500 instead.
 */
export class PluginRpcError extends Error {
  static {
    PluginRpcError.prototype.name = "PluginRpcError";
  }

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

class PluginRpcStubError extends Error {
  static {
    PluginRpcStubError.prototype.name = "PluginRpcStubError";
  }

  private constructor(message: string) {
    super(message);
  }

  /**
   * `vi.stubGlobal("fetch")` intercepts every request the test makes, not only
   * the ones this stub serves. Answering an unrecognised URL with a quiet 404
   * turns the common mistake — stubbing one plugin id and calling another —
   * into a rejection several layers downstream, naming neither. Failing here
   * names both sides of the mismatch at the point it happened.
   */
  static unservedFetch(url: string, prefix: string): PluginRpcStubError {
    return new PluginRpcStubError(
      `stubPluginRpc does not serve ${url}. It serves procedures under ` +
        `${prefix} — check the plugin id passed to stubPluginRpc against the ` +
        `one the client was created with.`,
    );
  }

  static nestedUnderProcedure(
    path: string,
    nested: string,
  ): PluginRpcStubError {
    return new PluginRpcStubError(
      `stubPluginRpc cannot serve "${path}" and "${nested}" together: ` +
        `"${path}" is a procedure, so nothing can be mounted under it.`,
    );
  }
}

// Reads the input off a request the handler declined to route, so the unrouted
// branch records what the routed one does. `toStandardBody` is the parser
// `RPCHandler`'s own fetch adapter runs, and oRPC's server-side codec
// deserializes with this very class — the pair is the server's decode path,
// not a second guess at the link's encoding.
const serializer = new StandardRPCSerializer(new StandardRPCJsonSerializer());

function stubProcedure(responder: PluginRpcResponder) {
  return os.handler(async ({ input }) => {
    try {
      return await responder(input);
    } catch (error) {
      if (error instanceof PluginRpcError) {
        throw new ORPCError(error.code, {
          status: error.status,
          message: error.message,
          data: error.data,
        });
      }
      throw error;
    }
  });
}

/**
 * The nested shape oRPC routes against, mirroring the slash-separated keys of
 * the route map: `"locations/list"` becomes `{ locations: { list } }`.
 */
type StubProcedure = ReturnType<typeof stubProcedure>;

interface StubRouter {
  [segment: string]: StubRouter | StubProcedure;
}

function buildRouter(
  routes: Readonly<Record<string, PluginRpcResponder>>,
): StubRouter {
  const paths = Object.keys(routes);
  // A router node is a procedure or a branch, never both, so `"list"` beside
  // `"list/count"` is a route map no server could serve either. Checked across
  // the whole map rather than as the tree is walked: which of the two survives
  // would otherwise depend on the order the keys were declared in.
  for (const path of paths) {
    const nested = paths.find((other) => other.startsWith(`${path}/`));
    if (nested !== undefined) {
      throw PluginRpcStubError.nestedUnderProcedure(path, nested);
    }
  }
  const root: StubRouter = {};
  const branches = new Map<string, StubRouter>([["", root]]);
  function branchFor(path: string): StubRouter {
    const existing = branches.get(path);
    if (existing !== undefined) return existing;
    const branch: StubRouter = {};
    mount(path, branch);
    branches.set(path, branch);
    return branch;
  }
  function mount(path: string, node: StubRouter | StubProcedure): void {
    const cut = path.lastIndexOf("/");
    branchFor(cut === -1 ? "" : path.slice(0, cut))[path.slice(cut + 1)] = node;
  }
  for (const [path, responder] of Object.entries(routes)) {
    mount(path, stubProcedure(responder));
  }
  return root;
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
  const prefix: `/${string}` = `/_plumix/rpc/${pluginId}`;
  const calls: PluginRpcCall[] = [];
  const handler = new RPCHandler(buildRouter(routes), {
    // The matched path and its revived input, read off the same call the
    // responder receives. Recording from the URL instead would re-derive both,
    // and would have to parse the multipart body a second time to do it.
    clientInterceptors: [
      (options) => {
        calls.push({
          procedure: options.path.join("/"),
          input: options.input,
        });
        return options.next();
      },
    ],
  });

  async function serve(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const prefixAt = pathname.indexOf(`${prefix}/`);
    if (prefixAt === -1)
      throw PluginRpcStubError.unservedFetch(request.url, prefix);
    if (request.method !== "POST") return methodNotAllowed(["POST"]);
    // A subdirectory deploy prepends a base path, so the procedures mount where
    // the request carries the prefix rather than at the root. The handler
    // anchors its prefix at the start of the pathname while the guard above
    // accepts it anywhere, so `handle` is told where it landed.
    const mountedAt: `/${string}` = `/${pathname.slice(1, prefixAt + prefix.length)}`;
    const result = await handler.handle(request, {
      prefix: mountedAt,
      context: {},
    });
    if (result.matched) return result.response;
    // Recorded even though nothing served it, so a test can't pass on a call it
    // never declared. oRPC reports the miss without dispatching, so no
    // interceptor ran and this is the only place the call is seen.
    calls.push(
      await declinedCall(request, pathname.slice(prefixAt + prefix.length + 1)),
    );
    return notFoundResponse("rpc-procedure-not-found");
  }

  vi.stubGlobal(
    "fetch",
    vi.fn(async (target: RequestInfo | URL, init?: RequestInit) =>
      serve(new Request(target, init)),
    ),
  );

  return {
    calls,
    lastCallTo: (procedure) =>
      calls.filter((call) => call.procedure === procedure).at(-1),
  };
}

async function declinedCall(
  request: Request,
  procedure: string,
): Promise<PluginRpcCall> {
  return {
    procedure,
    input: serializer.deserialize(await toStandardBody(request)),
  };
}
