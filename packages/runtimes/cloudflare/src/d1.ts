import { drizzle } from "drizzle-orm/d1";

import type {
  DatabaseAdapter,
  RequestScopedDb,
  RequestScopedDbArgs,
} from "@plumix/core";
import { isSecureRequest, readSessionCookie } from "@plumix/core";

import {
  buildBookmarkCookie,
  DEFAULT_BOOKMARK_COOKIE,
  isValidBookmark,
} from "./d1-session.js";

type D1SessionMode = "disabled" | "auto" | "primary-first";

export interface D1Config {
  readonly binding: string;
  /**
   * D1 Sessions API mode for read replication:
   * - "disabled" (default) — raw binding, no session wrapper. Strong
   *   consistency; reads always hit the primary.
   * - "auto" — writes go to primary; authenticated reads resume a prior
   *   bookmark when the client sent one; anonymous reads use the nearest
   *   replica (`first-unconstrained`).
   * - "primary-first" — session-wrapped but defaults to `first-primary`.
   *   Opt into Sessions-API semantics without nearest-replica routing.
   */
  readonly session?: D1SessionMode;
  /** Bookmark cookie name. Default: `__plumix_d1_bookmark`. */
  readonly bookmarkCookie?: string;
}

export interface D1DatabaseAdapter extends DatabaseAdapter {
  readonly config: D1Config;
}

export function d1(config: D1Config): D1DatabaseAdapter {
  const sessionEnabled = config.session && config.session !== "disabled";
  return {
    kind: "d1",
    config,
    connect: (env, _request, schema) => {
      const binding = getBinding(env, config.binding);
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

  // Any write — authenticated or not — must hit primary; we don't want a
  // write plus a follow-up read racing across replicas. Authenticated reads
  // resume from a prior bookmark when one is present and well-formed.
  // Everything else (anonymous reads — the whole point of read replicas)
  // uses the configured default.
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
  const sessionAsBinding = session as unknown as D1Database;
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
    throw new Error(
      `@plumix/runtime-cloudflare: D1 binding "${name}" missing from env`,
    );
  }
  return binding;
}
