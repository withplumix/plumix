import type {
  DatabaseAdapter,
  RequestScopedDb,
  RequestScopedDbArgs,
} from "plumix/runtime";
import { drizzle } from "drizzle-orm/d1";
import { isSecureRequest, readSessionCookie } from "plumix/auth";
import { responseAllowsSharedStorage } from "plumix/runtime";

import { d1Client } from "./d1-client.js";
import {
  buildBookmarkCookie,
  DEFAULT_BOOKMARK_COOKIE,
  isValidBookmark,
} from "./d1-session.js";
import { D1Error } from "./errors.js";
import { traceD1Client } from "./trace-d1.js";

type D1SessionMode = "disabled" | "auto" | "primary-first";

export interface D1Config {
  readonly binding: string;
  /**
   * `"disabled"` (default) always reads the primary. `"auto"` routes anonymous
   * reads to the nearest replica. `"primary-first"` wraps sessions but defaults
   * to `first-primary`.
   */
  readonly session?: D1SessionMode;
  /** Bookmark cookie name. Default: `__plumix_d1_bookmark`. */
  readonly bookmarkCookie?: string;
}

export interface D1DatabaseAdapter extends DatabaseAdapter {
  readonly config: D1Config;
}

// `responseAllowsSharedStorage` alone is true of a response that declared
// nothing, and a bookmark must not ride out on one.
function isSharedCacheable(response: Response): boolean {
  return (
    response.headers.has("cache-control") &&
    responseAllowsSharedStorage(response)
  );
}

export function d1(config: D1Config): D1DatabaseAdapter {
  const sessionEnabled = config.session && config.session !== "disabled";
  return {
    kind: "d1",
    config,
    requiredBindings: [config.binding],
    connect: (env, _request, schema) => {
      const binding = traceD1Client(d1Client(getBinding(env, config.binding)));
      const db = drizzle(binding, { schema, casing: "snake_case" });
      return { db };
    },
    connectRequest: sessionEnabled
      ? (args) => connectRequestScoped(config, args)
      : undefined,
  };
}

function connectRequestScoped(
  config: D1Config,
  args: RequestScopedDbArgs,
): RequestScopedDb | null {
  const binding = getBinding(args.env, config.binding);
  // Older workerd / @cloudflare/workers-types without Sessions API support.
  // Fall through to `connect` rather than failing hard.
  if (typeof binding.withSession !== "function") return null;

  const cookieName = config.bookmarkCookie ?? DEFAULT_BOOKMARK_COOKIE;
  const defaultConstraint: D1SessionConstraint =
    config.session === "primary-first"
      ? "first-primary"
      : "first-unconstrained";

  // Writes hit the primary so a write and follow-up read can't race across
  // replicas.
  let constraint: string = defaultConstraint;
  if (args.isWrite) {
    constraint = "first-primary";
  } else if (args.isAuthenticated) {
    const bookmark = readSessionCookie(args.request, cookieName);
    if (bookmark !== null && isValidBookmark(bookmark)) {
      constraint = bookmark;
    }
  }

  const session = binding.withSession(constraint);
  // Safety: `D1DatabaseSession` carries `prepare` and `batch` with the same
  // signatures `D1Database` declares, and those are the only members drizzle
  // and the tracer call — `dump`/`exec`/`withSession` are never reached.
  const sessionBinding = session as unknown as D1Database;
  const sessionAsBinding = traceD1Client(d1Client(sessionBinding));
  const db = drizzle(sessionAsBinding, {
    schema: args.schema,
    casing: "snake_case",
  });

  const secure = isSecureRequest(args.request);

  return {
    db,
    commit(response) {
      // Anonymous users can't resume a bookmark across requests, so don't
      // bother persisting one. Writes performed by anonymous users still
      // route to primary — see the constraint logic above.
      if (!args.isAuthenticated) return response;
      const newBookmark = session.getBookmark();
      // Validate what we're about to emit — symmetric with the input side.
      // Guards against Set-Cookie injection if D1 ever surfaces a bookmark
      // containing `;`, CR/LF, or other header-separator chars.
      if (!newBookmark || !isValidBookmark(newBookmark)) return response;
      // A shared-cacheable page must not carry a per-visitor cookie the CDN
      // would hand to everyone; the bookmark is only an optimisation.
      if (isSharedCacheable(response)) return response;
      const next = new Response(response.body, response);
      next.headers.append(
        "set-cookie",
        buildBookmarkCookie(newBookmark, cookieName, secure),
      );
      return next;
    },
  };
}

type D1SessionConstraint = "first-primary" | "first-unconstrained";

function getBinding(env: unknown, name: string): D1Database {
  const bindings = env as Record<string, D1Database | undefined>;
  const binding = bindings[name];
  if (!binding) {
    throw D1Error.bindingMissing({ binding: name });
  }
  return binding;
}
