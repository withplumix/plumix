/**
 * The hard gate — wiring the pure {@link resolveAccess} into the public render
 * path. {@link policyForMatch} finds the policy attached to a matched route
 * (entry-type default for single/archive intents, the route-level policy for a
 * custom archive, else none); {@link enforceAccess} resolves it against the
 * loaded principal and turns a non-`allow` gate into an HTTP response — a 302
 * to sign-in (with a `returnTo`), or a terminal challenge response.
 *
 * No cache changes live here: a policied route opts out of the edge cache and
 * renders live (the caller decides that from `policyForMatch` returning a
 * policy). The segment becomes a cache-key axis in the follow-up slice.
 */

import type { PlumixAuthConfig } from "../auth/config.js";
import type { AppContext } from "../context/app.js";
import type { RouteMatch } from "../route/match.js";
import type { AccessPolicy } from "./policy.js";
import { withBasePath } from "../base-path.js";
import { redirect } from "../runtime/http.js";
import { resolveAccess } from "./policy.js";

// Where `redirectToLogin()` sends a visitor when the operator sets no override.
const DEFAULT_LOGIN_PATH = "/_plumix/admin/login";

// Challenge kind → terminal HTTP status. A role denial is a 403 (the visitor
// is signed in; re-authenticating wouldn't help), every other challenge is the
// 402 paywall default. A later slice renders a themed teaser for the soft gate.
const CHALLENGE_STATUS: Readonly<Record<string, number>> = { forbidden: 403 };

/** The configured login path, defaulting to the admin login. */
export function resolveLoginPath(auth: PlumixAuthConfig): string {
  return auth.loginPath ?? DEFAULT_LOGIN_PATH;
}

/**
 * The access policy attached to a matched route, or `null` when the route is
 * un-policied (the global `anonymous` default — behaves exactly as today). A
 * single or archive intent inherits its entry type's `access.default`; a custom
 * archive carries its own route-level `access`; every other intent (taxonomy,
 * author, date, front page, search) and an unmatched route are un-policied.
 */
export function policyForMatch(
  ctx: AppContext,
  match: RouteMatch | null,
): AccessPolicy | null {
  const intent = match?.intent;
  if (!intent) return null;
  if (intent.kind === "single" || intent.kind === "archive") {
    return (
      ctx.plugins.entryTypes.get(intent.entryType)?.access?.default ?? null
    );
  }
  if (intent.kind === "custom") {
    return ctx.plugins.archiveTypes.get(intent.name)?.access ?? null;
  }
  return null;
}

interface EnforceAccessArgs {
  readonly ctx: AppContext;
  /** The current (base-stripped) request URL — the `returnTo` destination. */
  readonly url: URL;
  readonly policy: AccessPolicy;
  readonly loginPath: string;
}

/**
 * Resolve `policy` against the loaded principal and enforce the hard gate.
 * Returns a short-circuit `Response` for a `redirect` or `challenge` gate, or
 * `null` to let the render proceed (`allow`).
 */
export async function enforceAccess(
  args: EnforceAccessArgs,
): Promise<Response | null> {
  const { gate } = await resolveAccess(args.ctx, args.policy);
  switch (gate.type) {
    case "allow":
      return null;
    case "redirect":
      return redirect(
        loginRedirect(args.loginPath, args.url, args.ctx.basePath),
        302,
      );
    case "challenge":
      return challengeResponse(gate.kind);
  }
}

// Build the sign-in `Location`: the (base-prefixed) login path carrying a
// `redirectTo` of the (base-prefixed) current path, so the honouring flow —
// #1735's OAuth/magic-link `redirectTo` threading — returns the visitor here.
function loginRedirect(loginPath: string, url: URL, basePath: string): string {
  const returnTo = withBasePath(`${url.pathname}${url.search}`, basePath);
  const target = new URL(withBasePath(loginPath, basePath), url);
  target.search = "";
  target.searchParams.set("redirectTo", returnTo);
  return `${target.pathname}${target.search}`;
}

// Hard gate: the protected content is never sent — only the challenge status.
// `private, no-store` keeps the terminal response out of every cache.
function challengeResponse(kind: string): Response {
  const status = CHALLENGE_STATUS[kind] ?? 402;
  return new Response(status === 403 ? "Forbidden" : "Payment Required", {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-plumix-challenge": kind,
      "cache-control": "private, no-store",
    },
  });
}
