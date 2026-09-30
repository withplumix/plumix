// Serve RPC procedures from a test instead of the network, by substituting
// `fetch` — the platform boundary every oRPC client already calls through. Both
// the admin's own stub (the core router, at `/_plumix/rpc`) and the published
// `stubPluginRpc` (one plugin's namespace) are this function with a different
// prefix.
//
// Served by oRPC's own `RPCHandler` — the class the dispatcher builds the real
// merged router on — rather than by re-implementing the wire format here. Two
// hand-written copies of one protocol drift, and only someone reading both ever
// catches it: that is how the missing `meta` type hints (#2411), the
// non-envelope error bodies (#2418) and the admin copy that kept both (#2431)
// got in.

import type {
  AnyProcedure,
  AnyRouter,
  InferRouterInputs,
  InferRouterOutputs,
  Lazyable,
} from "@orpc/server";
import { ORPCError } from "@orpc/client";
import {
  StandardRPCJsonSerializer,
  StandardRPCSerializer,
} from "@orpc/client/standard";
import { os } from "@orpc/server";
import { RPCHandler } from "@orpc/server/fetch";
import { toStandardBody } from "@orpc/standard-server-fetch";
import { vi } from "vitest";

import type { JsonValue } from "../json.js";
import { methodNotAllowed, notFound } from "../runtime/contract/http.js";

/**
 * What an untyped responder may hand back: plain JSON, plus every value
 * `StandardRPCJsonSerializer` encodes with a `meta` type hint, nested at any
 * depth — returning a `Date` here is the point, the client revives one.
 *
 * `undefined` is admitted at the top level because a procedure returning
 * nothing serializes exactly that way; the cost is that a responder missing its
 * `return` type-checks. A `Blob` switches the whole message to multipart
 * `FormData`, which the handler builds and parses as the server does.
 */
type RpcStubValue =
  | JsonValue
  | Date
  | bigint
  | URL
  | RegExp
  | Blob
  | undefined
  | ReadonlySet<RpcStubValue>
  | ReadonlyMap<RpcStubValue, RpcStubValue>
  | readonly RpcStubValue[]
  | { readonly [key: string]: RpcStubValue };

/**
 * Every procedure of `TRouter`, paired with the slash-joined path it is called
 * under — `{ locations: { list } }` yields `"locations/list"`. Walks the router
 * the way `InferRouterInputs` does, lazy branches included.
 *
 * `TDepth` bounds the walk: checked against `AnyRouter` itself, a router nests
 * without end, and TypeScript gives up on the whole type rather than on the
 * branch. No real router comes near the bound.
 */
type ProcedureAt<
  TRouter,
  TPrefix extends string = "",
  TDepth extends readonly unknown[] = [],
> = TDepth["length"] extends 8
  ? never
  : {
      [K in keyof TRouter & string]: TRouter[K] extends Lazyable<
        infer U extends AnyRouter
      >
        ? U extends AnyProcedure
          ? { readonly path: `${TPrefix}${K}`; readonly procedure: U }
          : ProcedureAt<U, `${TPrefix}${K}/`, [...TDepth, unknown]>
        : never;
    }[keyof TRouter & string];

/** What crosses the wire for one procedure, in each direction. */
interface ProcedureWire {
  readonly input: unknown;
  readonly output: unknown;
}

/**
 * The router flattened to one row per procedure path. Without a router
 * (`never`, the default) every path is open and carries any serializable value.
 */
type WireTable<TRouter extends AnyRouter> = [TRouter] extends [never]
  ? Readonly<
      Record<string, { readonly input: unknown; readonly output: RpcStubValue }>
    >
  : {
      readonly [P in ProcedureAt<TRouter> as P["path"]]: {
        readonly input: InferRouterInputs<P["procedure"]>;
        readonly output: InferRouterOutputs<P["procedure"]>;
      };
    };

type RoutesFor<TTable extends Readonly<Record<string, ProcedureWire>>> = {
  readonly [P in keyof TTable]?: (
    input: TTable[P]["input"],
  ) => TTable[P]["output"] | Promise<TTable[P]["output"]>;
};

type CallFor<
  TTable extends Readonly<Record<string, ProcedureWire>>,
  TPath extends keyof TTable & string,
> = {
  [P in TPath]: {
    /** Slash-joined procedure path under the served prefix. */
    readonly procedure: P;
    readonly input: TTable[P]["input"];
  };
}[TPath];

/**
 * The route map `stubRpcEndpoint` serves, keyed by slash-joined procedure path.
 *
 * Given a router type, a key is one of its procedures, a responder's `input` is
 * what the client sends that procedure, and its return is what the client
 * receives — so a renamed procedure or a reshaped output breaks the test at
 * compile time rather than leaving a fixture the real server no longer
 * matches. Without one (`never`, the default), any path takes any responder.
 *
 * A responder's `input` arrives revived, as a real handler's would: a `Date`
 * the caller passed is a `Date` here, and a `Blob` is a `Blob` read back out of
 * the multipart body. Throwing an `RpcReplyError` answers with that error's
 * status, code and data; throwing an `ORPCError` passes it through untouched;
 * throwing anything else answers with the handler's own 500.
 */
export type RpcStubRoutes<TRouter extends AnyRouter = never> = RoutesFor<
  WireTable<TRouter>
>;

/** A procedure path `TRouter` serves, or any path without a router. */
type RpcStubPath<TRouter extends AnyRouter = never> = keyof WireTable<TRouter> &
  string;

/** One RPC request the client sent, decoded from the wire envelope. */
export type RpcStubCall<
  TRouter extends AnyRouter = never,
  TPath extends RpcStubPath<TRouter> = RpcStubPath<TRouter>,
> = CallFor<WireTable<TRouter>, TPath>;

export interface RpcStub<TRouter extends AnyRouter = never> {
  /** Every request the client sent, in order — routed or not. */
  readonly calls: readonly RpcStubCall<TRouter>[];
  readonly lastCallTo: <TPath extends RpcStubPath<TRouter>>(
    procedure: TPath,
  ) => RpcStubCall<TRouter, TPath> | undefined;
}

export interface StubRpcEndpointOptions<TRouter extends AnyRouter = never> {
  /** Where the procedures mount, e.g. `/_plumix/rpc`. A base path may precede it. */
  readonly prefix: `/${string}`;
  readonly routes: RpcStubRoutes<TRouter>;
  /**
   * Appended to the error thrown for a fetch outside `prefix`: what the caller
   * most likely got wrong, in terms of their own API.
   */
  readonly unservedHint?: string;
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
export class RpcReplyError extends Error {
  static {
    RpcReplyError.prototype.name = "RpcReplyError";
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

class RpcStubMisuseError extends Error {
  static {
    RpcStubMisuseError.prototype.name = "RpcStubMisuseError";
  }

  private constructor(message: string) {
    super(message);
  }

  /**
   * `vi.stubGlobal("fetch")` intercepts every request the test makes, not only
   * the ones this stub serves. Answering an unrecognised URL with a quiet 404
   * turns the common mistake — stubbing one prefix and calling another — into a
   * rejection several layers downstream, naming neither. Failing here names
   * both sides of the mismatch at the point it happened.
   */
  static unservedFetch(
    url: string,
    prefix: string,
    hint: string | undefined,
  ): RpcStubMisuseError {
    return new RpcStubMisuseError(
      `The RPC stub does not serve ${url}. It serves procedures under ` +
        `${prefix}${hint === undefined ? "." : ` — ${hint}`}`,
    );
  }

  static nestedUnderProcedure(
    path: string,
    nested: string,
  ): RpcStubMisuseError {
    return new RpcStubMisuseError(
      `The RPC stub cannot serve "${path}" and "${nested}" together: ` +
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

// Typed and untyped route maps meet here: the responder's signature was checked
// where the caller wrote the map, and the handler hands it the revived input.
type ServedResponder = (input: never) => unknown;

function stubProcedure(responder: ServedResponder) {
  return os.handler(async ({ input }) => {
    try {
      // Safety: the input is whatever the client sent this procedure path,
      // which is the type the route map declared for the responder at this key.
      return await (responder as (input: unknown) => unknown)(input);
    } catch (error) {
      if (error instanceof RpcReplyError) {
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
  routes: Readonly<Partial<Record<string, ServedResponder>>>,
): StubRouter {
  const entries = Object.entries(routes).flatMap(([path, responder]) =>
    responder === undefined ? [] : [[path, responder] as const],
  );
  const paths = entries.map(([path]) => path);
  // A router node is a procedure or a branch, never both, so `"list"` beside
  // `"list/count"` is a route map no server could serve either. Checked across
  // the whole map rather than as the tree is walked: which of the two survives
  // would otherwise depend on the order the keys were declared in.
  for (const path of paths) {
    const nested = paths.find((other) => other.startsWith(`${path}/`));
    if (nested !== undefined) {
      throw RpcStubMisuseError.nestedUnderProcedure(path, nested);
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
  for (const [path, responder] of entries) {
    mount(path, stubProcedure(responder));
  }
  return root;
}

interface RecordedCall {
  readonly procedure: string;
  readonly input: unknown;
}

interface ServedRoutesOptions {
  readonly prefix: `/${string}`;
  readonly routes: Readonly<Partial<Record<string, ServedResponder>>>;
  readonly unservedHint?: string;
}

interface ServedStub {
  readonly calls: readonly RecordedCall[];
  readonly lastCallTo: (procedure: string) => RecordedCall | undefined;
}

/**
 * Stub global `fetch` to serve `routes` under `prefix`. An unrouted procedure
 * answers the dispatcher's own 404 and is still recorded, so a test can't pass
 * by accident on a call it never declared; a fetch outside `prefix` throws.
 */
export function stubRpcEndpoint<TRouter extends AnyRouter = never>(
  options: StubRpcEndpointOptions<NoInfer<TRouter>>,
): RpcStub<TRouter>;
// The typed signature above is checked where the caller writes the route map;
// past it, each responder is served the input the client sent its own path and
// every recorded call pairs a path with that path's input.
export function stubRpcEndpoint(options: ServedRoutesOptions): ServedStub {
  const { prefix, unservedHint } = options;
  const calls: RecordedCall[] = [];
  const handler = new RPCHandler(buildRouter(options.routes), {
    // The matched path and its revived input, read off the same call the
    // responder receives. Recording from the URL instead would re-derive both,
    // and would have to parse the multipart body a second time to do it.
    clientInterceptors: [
      (interceptorOptions) => {
        calls.push({
          procedure: interceptorOptions.path.join("/"),
          input: interceptorOptions.input,
        });
        return interceptorOptions.next();
      },
    ],
  });

  async function serve(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    const prefixAt = pathname.indexOf(`${prefix}/`);
    if (prefixAt === -1) {
      throw RpcStubMisuseError.unservedFetch(request.url, prefix, unservedHint);
    }
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
    calls.push({
      procedure: pathname.slice(prefixAt + prefix.length + 1),
      input: serializer.deserialize(await toStandardBody(request)),
    });
    return notFound("rpc-procedure-not-found");
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
