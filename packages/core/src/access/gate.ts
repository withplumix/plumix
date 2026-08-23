/**
 * The hard gate — wiring the pure access resolution into the public render
 * path. {@link policyForMatch} finds the policy attached to a matched route
 * (the entry's per-entry choice for a single intent, the entry-type default for
 * an archive, the route-level policy for a custom archive, else none); the
 * dispatcher resolves it against the loaded principal once (reading the segment
 * for the cache key), and
 * {@link gateToResponse} turns a non-`allow` gate into an HTTP response — a 302
 * to sign-in (with a `returnTo`), or a terminal challenge response.
 */

import type { PlumixAuthConfig } from "../auth/config.js";
import type { AppContext } from "../context/app.js";
import type { JsonObject } from "../json.js";
import type { EntryTypeAccess } from "../plugin/manifest.js";
import type { RouteMatch } from "../route/match.js";
import type { AccessPolicy, Gate } from "./policy.js";
import { withBasePath } from "../base-path.js";
import { resolveSingleEntry } from "../route/single-entry.js";
import { redirectTo } from "../runtime/http.js";
import { ACCESS_POLICY_META_KEY } from "./meta-key.js";

// Where `redirectToLogin()` sends a visitor when the operator sets no override.
const DEFAULT_LOGIN_PATH = "/_plumix/admin/login";

// Challenge kind → terminal HTTP status. A role denial is a 403 (the visitor
// is signed in; re-authenticating wouldn't help), every other challenge is the
// 402 paywall default. A *soft* challenge never reaches here — it renders a
// teaser at 200 (see `gateToResponse`).
const CHALLENGE_STATUS: Readonly<Record<string, number>> = { forbidden: 403 };

/** The configured login path, defaulting to the admin login. */
export function resolveLoginPath(auth: PlumixAuthConfig): string {
  return auth.loginPath ?? DEFAULT_LOGIN_PATH;
}

/**
 * The access policy attached to a matched route, or `null` when the route is
 * un-policied (the global `anonymous` default — behaves exactly as today).
 *
 * Precedence is per-entry › entry-type › global. A `single` intent resolves the
 * addressed entry and honours its stored per-entry choice ({@link selectEntryPolicy})
 * when the type declares a selectable space, otherwise the type's
 * `access.default`; an `archive` intent always uses the type's `access.default`
 * (per-entry visibility is a property of the entry's own page, not the listing);
 * a custom archive carries its own route-level `access`; every other intent
 * (taxonomy, author, date, front page, search) and an unmatched route are
 * un-policied.
 *
 * The per-entry lookup runs only for a type that declares a non-empty
 * `access.policies` space — an un-policied type, or one with only a `default`,
 * still resolves without touching the database, so the hot path is unchanged.
 * A would-be-404 single (no matching entry) resolves to the type default, so
 * gating stays fail-closed by type and never leaks which slugs exist.
 *
 * A `?preview=`-revealed draft is gated by its own stored per-entry choice too
 * (the resolver returns the draft row; the gate reads its persisted meta) — a
 * preview link honours per-entry visibility rather than bypassing it, matching
 * the fail-closed stance the type-level gate already takes for preview traffic.
 */
export async function policyForMatch(
  ctx: AppContext,
  match: RouteMatch | null,
): Promise<AccessPolicy | null> {
  const intent = match?.intent;
  if (!intent) return null;
  if (intent.kind === "single") {
    const access = ctx.plugins.entryTypes.get(intent.entryType)?.access;
    if (!access) return null;
    if (!access.policies || access.policies.length === 0) {
      return access.default;
    }
    const row = await resolveSingleEntry(ctx, intent.entryType, match.params);
    return selectEntryPolicy(access, readAccessKey(row?.meta));
  }
  if (intent.kind === "archive") {
    return (
      ctx.plugins.entryTypes.get(intent.entryType)?.access?.default ?? null
    );
  }
  if (intent.kind === "custom") {
    return ctx.plugins.archiveTypes.get(intent.name)?.access ?? null;
  }
  return null;
}

/**
 * Resolve an entry type's effective policy for one entry: the policy whose key
 * the entry stored, else the type `default`. A stored key outside the declared
 * space (a policy the developer removed) falls back to `default` — a stale
 * selection never grants less than the type baseline. Pure.
 *
 * Operator note: because a stale key resolves to `default`, *removing* a
 * selectable policy that was more restrictive than `default` relaxes every
 * entry that had selected it — there is no migration signal. Rename/replace
 * in place rather than delete when tightening isn't intended.
 */
export function selectEntryPolicy(
  access: EntryTypeAccess,
  storedKey: string | undefined,
): AccessPolicy {
  if (storedKey !== undefined) {
    const chosen = access.policies?.find((p) => p.key === storedKey);
    if (chosen) return chosen.policy;
  }
  return access.default;
}

// The per-entry access choice stored under the reserved meta key, or `undefined`
// when unset (or stored as a non-string by some out-of-band write).
function readAccessKey(
  meta: JsonObject | null | undefined,
): string | undefined {
  const value = meta?.[ACCESS_POLICY_META_KEY];
  return typeof value === "string" ? value : undefined;
}

interface GateResponseArgs {
  readonly ctx: AppContext;
  /** The current (base-stripped) request URL — the `returnTo` destination. */
  readonly url: URL;
  readonly loginPath: string;
}

/**
 * Turn an already-resolved {@link Gate} into a short-circuit `Response` — a 302
 * to sign-in for `redirect`, a terminal challenge response for a *hard*
 * `challenge`, or `null` for `allow` and a *soft* `challenge` (let the render
 * proceed — a soft gate serves a teaser at 200). Split from resolution so the
 * dispatcher can resolve access once — reading the segment for the cache key
 * and the gate for enforcement from a single, possibly I/O-bearing, run.
 */
export function gateToResponse(
  gate: Gate,
  args: GateResponseArgs,
): Response | null {
  switch (gate.type) {
    case "allow":
      return null;
    case "redirect":
      // Same `private, no-store` + `Vary: cookie` the allow/challenge paths
      // carry: the 302 is anonymous-only and per-visitor, so a heuristically
      // caching intermediary must never store it and bounce a signed-in user
      // to login. A bare 302 isn't cacheable by default — this is belt-and-suspenders.
      return redirectTo(
        loginRedirect(args.loginPath, args.url, args.ctx.basePath),
        { "cache-control": "private, no-store", vary: "cookie" },
      );
    case "challenge":
      return gate.soft ? null : challengeResponse(gate.kind);
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
