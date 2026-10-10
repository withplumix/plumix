import type { AppContext } from "../context/app-context.js";
import type { JsonObject } from "../json.js";
import type { ResolvedMeta } from "../meta/contract/bags.js";
import type { EntryTypeAccess } from "../plugin/manifest.js";
import type { RouteMatch } from "../route/match.js";
import type { AccessPolicy, Gate } from "./policy.js";
import { withBasePath } from "../base-path.js";
import { resolveLocale } from "../i18n/resolve-locale.js";
import { resolveSingleEntry } from "../route/single-entry.js";
import { redirectTo } from "../runtime/contract/http.js";
import { ACCESS_POLICY_META_KEY } from "./contract/meta-key.js";
import { resolveAccess } from "./policy.js";

// A role denial is 403 because re-authenticating wouldn't help; every other
// challenge is the 402 paywall default.
const CHALLENGE_STATUS: Readonly<Record<string, number>> = { forbidden: 403 };

/**
 * Reads the database only for a type with a non-empty `access.policies` space.
 * A missing entry gets the type default, so gating never leaks which slugs
 * exist.
 */
export async function policyForMatch(
  ctx: AppContext,
  match: RouteMatch | null,
): Promise<AccessPolicy | null> {
  const intent = match?.intent;
  if (!intent) return null;
  if (intent.kind === "entry") {
    const access = ctx.plugins.entryTypes.get(intent.entryType)?.access;
    if (!access) return null;
    if (!access.policies || access.policies.length === 0) {
      return access.default;
    }
    const row = await resolveSingleEntry(ctx, intent, match.params);
    return selectEntryPolicy(access, readAccessKey(row?.meta));
  }
  if (intent.kind === "entryType") {
    return (
      ctx.plugins.entryTypes.get(intent.entryType)?.access?.default ?? null
    );
  }
  if (intent.kind === "archiveType") {
    return ctx.plugins.archiveTypes.get(intent.name)?.access ?? null;
  }
  if (intent.kind === "view") {
    return ctx.plugins.views.get(intent.name)?.access ?? null;
  }
  return null;
}

/**
 * A stale stored key falls back to `default`, so removing a policy stricter
 * than `default` silently relaxes every entry that selected it.
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

/** The parts of an entry an access decision reads. */
export interface EntryAccessSubject {
  readonly type: string;
  /**
   * Either form works: the access key is a plain string that survives decoding.
   */
  readonly meta?: JsonObject | ResolvedMeta | null;
}

// The per-entry access choice stored under the reserved meta key, or
// `undefined` when unset (or stored as a non-string by some out-of-band write).
function readAccessKey(meta: EntryAccessSubject["meta"]): string | undefined {
  const value = meta?.[ACCESS_POLICY_META_KEY];
  return typeof value === "string" ? value : undefined;
}

/**
 * Resolves against an anonymous principal whoever asks, so a publicly cached
 * artefact gets a principal-invariant answer. Weighs only the access policy,
 * not publication status.
 */
export async function entryAllowsAnonymousAccess(
  ctx: AppContext,
  entry: EntryAccessSubject,
): Promise<boolean> {
  const access = ctx.plugins.entryTypes.get(entry.type)?.access;
  if (access === undefined) return true;
  const policy = selectEntryPolicy(access, readAccessKey(entry.meta));
  const { gate } = await resolveAccess(asAnonymous(ctx), policy);
  return gateAllowsRender(gate);
}

// Drops everything the principal confers, or a capability check would use the
// asker's privileges. `ctx.request` keeps the cookie because policies read its
// URL and headers.
function asAnonymous(ctx: AppContext): AppContext {
  return {
    ...ctx,
    user: null,
    tokenScopes: null,
    auth: { can: () => false },
    locale: resolveLocale({
      request: ctx.request,
      user: null,
      i18n: ctx.config.i18n,
    }),
    access: null,
  };
}

function gateAllowsRender(gate: Gate): boolean {
  return (
    gate.type === "allow" || (gate.type === "challenge" && gate.soft === true)
  );
}

interface GateResponseArgs {
  readonly ctx: Pick<AppContext, "config">;
  readonly url: URL;
  readonly loginPath: string;
}

/**
 * `null` for `allow` and a soft `challenge`. Split from resolution so one
 * possibly I/O-bearing run yields both the cache segment and the gate.
 */
export function gateToResponse(
  gate: Gate,
  args: GateResponseArgs,
): Response | null {
  switch (gate.type) {
    case "allow":
      return null;
    case "redirect":
      // A heuristically caching intermediary must never store this per-visitor
      // 302 and bounce a signed-in user to login.
      return redirectTo(
        loginRedirect(args.loginPath, args.url, args.ctx.config.basePath),
        { "cache-control": "private, no-store", vary: "cookie" },
      );
    case "challenge":
      return gateAllowsRender(gate) ? null : challengeResponse(gate.kind);
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
