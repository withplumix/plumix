import type { AppContext } from "../context/app-context.js";
import type { EntryTypeAccess } from "../plugin/manifest.js";
import type { RouteMatch } from "../route/match.js";
import type { AccessPolicy, Gate } from "./policy.js";
import { withBasePath } from "../base-path.js";
import { resolveSingleEntry } from "../route/single-entry.js";
import { redirectTo } from "../runtime/contract/http.js";
import { readAccessKey } from "./contract/access-key.js";

/**
 * A role denial is 403 because re-authenticating wouldn't help; every other
 * challenge is the 402 paywall default.
 */
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

/**
 * Both paths are base-prefixed, so the OAuth and magic-link flows that honour
 * `redirectTo` return the visitor here.
 */
function loginRedirect(loginPath: string, url: URL, basePath: string): string {
  const returnTo = withBasePath(`${url.pathname}${url.search}`, basePath);
  const target = new URL(withBasePath(loginPath, basePath), url);
  target.search = "";
  target.searchParams.set("redirectTo", returnTo);
  return `${target.pathname}${target.search}`;
}

/**
 * Hard gate: the protected content is never sent — only the challenge status.
 * `private, no-store` keeps the terminal response out of every cache.
 */
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
