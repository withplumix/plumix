// Served by oRPC's own `RPCHandler`, not a hand-written copy of the wire
// format: two copies of one protocol drift unnoticed.

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
 * Plain JSON plus anything `StandardRPCJsonSerializer` types with a `meta`
 * hint. Top-level `undefined` is how a void procedure serializes; a `Blob`
 * switches to multipart.
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
 * Each procedure of `TRouter` with its slash-joined path. `TDepth` bounds the
 * walk: an `AnyRouter` nests without end and TypeScript gives up on the whole
 * type.
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
 * Route map keyed by procedure path; given a router type, responders are typed
 * against it so drift breaks at compile time. Throw `RpcReplyError` for a
 * specific error.
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
  /**
   * Where the procedures mount, e.g. `/_plumix/rpc`. A base path may precede
   * it.
   */
  readonly prefix: `/${string}`;
  readonly routes: RpcStubRoutes<TRouter>;
  /**
   * Appended to the error thrown for a fetch outside `prefix`: what the caller
   * most likely got wrong, in terms of their own API.
   */
  readonly unservedHint?: string;
}

/**
 * Throw from a responder to answer a specific oRPC error. `status` must be
 * below 200 or 400 and up; an envelope can't carry 2xx/3xx, which answer 500.
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
   * A quiet 404 for an unserved URL would surface layers downstream naming
   * neither side; failing here names both at the point of the mismatch.
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

/**
 * Decodes an unrouted request's input with the server's own decode path, so the
 * unrouted branch records what the routed one does.
 */
const serializer = new StandardRPCSerializer(new StandardRPCJsonSerializer());

/**
 * Typed and untyped route maps meet here: the responder's signature was checked
 * where the caller wrote the map, and the handler hands it the revived input.
 */
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
  // A node is a procedure or a branch, never both. Checked across the whole
  // map, or which survives would depend on key order.
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
 * Stub global `fetch` to serve `routes` under `prefix`. Unrouted procedures 404
 * but are recorded; a fetch outside `prefix` throws.
 */
export function stubRpcEndpoint<TRouter extends AnyRouter = never>(
  options: StubRpcEndpointOptions<NoInfer<TRouter>>,
): RpcStub<TRouter>;
/** Past the typed overload, each responder is served its own path's input. */
export function stubRpcEndpoint(options: ServedRoutesOptions): ServedStub {
  const { prefix, unservedHint } = options;
  const calls: RecordedCall[] = [];
  const handler = new RPCHandler(buildRouter(options.routes), {
    // Recorded off the call the responder receives; re-deriving from the URL
    // would parse the multipart body twice.
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
    // A subdirectory deploy prepends a base path, and the handler anchors its
    // prefix at the pathname start, so `handle` is told where it landed.
    const mountedAt: `/${string}` = `/${pathname.slice(1, prefixAt + prefix.length)}`;
    const result = await handler.handle(request, {
      prefix: mountedAt,
      context: {},
    });
    if (result.matched) return result.response;
    // oRPC reports the miss without dispatching, so no interceptor ran and this
    // is the only place the call is seen.
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
