/**
 * Access policies — the "open logic, closed output" core.
 *
 * A policy pairs a developer-supplied resolver (`(ctx) => Outcome`, whose
 * decision logic is unconstrained — role, entitlement, a `meta` flag, an
 * external billing check, a time window) with a *closed* return shape. The
 * resolver returns one of three discrete outcomes; {@link resolveAccess} maps
 * that to a `{ segment, gate }` pair. Because everything downstream (the hard
 * gate here, and the segment-keyed cache + theme render in later slices) only
 * ever sees the discrete output — never the arbitrary logic behind it — the
 * gate and cache stay sound no matter how exotic the rule is.
 *
 * The pure resolution performs no I/O of its own; any I/O (an entitlement
 * lookup) lives inside the developer's resolver, which may be async.
 */

import type { AppContext, AuthenticatedUser } from "../context/app.js";
import type { UserRole } from "../db/schema/users.js";
import { roleLevel } from "../auth/rbac.js";
import { USER_ROLES } from "../db/schema/users.js";

/**
 * The reserved segment that is never shared-cached. A `grant("private")` gates
 * the route yet keeps its render per-visitor — the explicit escape hatch for a
 * personalized authenticated page. The edge cache never reads or writes it.
 */
export const PRIVATE_SEGMENT = "private";

/**
 * Audience segments derived for free from the loaded principal — no extra
 * lookup. `entitlement:<label>` and other custom labels come only from a
 * developer `grant()` and are declared in the policy's `segments` space.
 * `private` is the reserved never-cached escape hatch.
 */
export type BuiltinSegment =
  "anonymous" | "authenticated" | "private" | `role:${UserRole}`;

/**
 * The membership / paywall segment family — a developer-defined `<label>` (a
 * membership, plan, or tier) resolved by their entitlement check and declared
 * in the policy's `segments` space. Open-ended by design, so unlike the closed
 * `role:` family it is not a built-in: each label must be declared.
 */
export type EntitlementSegment = `entitlement:${string}`;

/**
 * A resolved audience segment: a built-in, an `entitlement:<label>`, or another
 * custom label. `(string & {})` keeps custom labels assignable while preserving
 * autocomplete for the built-ins.
 */
export type Segment = BuiltinSegment | EntitlementSegment | (string & {});

const ENTITLEMENT_PREFIX = "entitlement:";

/** Build the `entitlement:<label>` segment string for a policy's `segments`. */
export function entitlementSegment(label: string): EntitlementSegment {
  return `${ENTITLEMENT_PREFIX}${label}`;
}

/** The gate decision one policy resolution yields. Closed union. */
export type Gate =
  | { readonly type: "allow" }
  /** Redirect an anonymous visitor to sign-in, returning them afterwards. */
  | { readonly type: "redirect" }
  /**
   * An unmet requirement. A *hard* challenge (`soft` absent/false) blocks — a
   * terminal 402 upsell or 403 denial, no content sent. A *soft* challenge lets
   * the render proceed at 200 so the theme can serve a teaser (or client-locked
   * full content) at the same URL, cached under the visitor's own segment as a
   * variant distinct from the entitled full render.
   */
  | {
      readonly type: "challenge";
      readonly kind: string;
      readonly soft?: boolean;
    };

/**
 * What a policy's `resolve` returns — the closed set of outcomes. Built via the
 * {@link grant} / {@link redirectToLogin} / {@link challenge} / {@link entitlement}
 * constructors so call sites never hand-shape the discriminated union.
 */
export type AccessOutcome =
  | { readonly type: "grant"; readonly segment: string }
  | { readonly type: "redirect" }
  | {
      readonly type: "challenge";
      readonly kind: string;
      readonly soft?: boolean;
    };

/** Options for {@link challenge}. */
export interface ChallengeOptions {
  /**
   * Opt into a *soft* gate: instead of a terminal 402/403 the render proceeds
   * at 200 with the resolved {@link Access} exposed on `ctx.access`, so the
   * theme can serve a teaser variant. Off by default — the hard gate is the
   * default; soft is the explicit opt-in.
   *
   * The teaser is a *public* document: it is keyed to the visitor's free
   * segment (`anonymous` shares the plain-URL, crawler-indexable entry;
   * `authenticated` shares one entry across every signed-in un-entitled
   * visitor), so it must be principal-invariant — never place per-user content,
   * or gated content the operator isn't willing to serve publicly, in a soft
   * teaser. Withholding the protected body means rendering less of it
   * server-side; a client-only lock over a fully-delivered body is presentation,
   * not protection.
   */
  readonly soft?: boolean;
}

/** Grant access, tagging the render with `segment` (a built-in or declared). */
export function grant(segment: string): AccessOutcome {
  return { type: "grant", segment };
}

/**
 * Grant access under an `entitlement:<label>` segment — the membership /
 * paywall case. Sugar over `grant(entitlementSegment(label))`; declare the same
 * label in the policy's `segments` space (via {@link entitlementSegment}) so the
 * closed-output contract admits it. Every entitled principal shares one variant.
 */
export function entitlement(label: string): AccessOutcome {
  return grant(entitlementSegment(label));
}

/** Send an anonymous visitor to sign-in (returned afterwards via `redirectTo`). */
export function redirectToLogin(): AccessOutcome {
  return { type: "redirect" };
}

/**
 * Signal an unmet requirement (`"subscribe"` upsell, `"forbidden"` denial, …).
 * Hard by default — a terminal challenge response. Pass `{ soft: true }` to let
 * the render proceed so the theme serves a teaser at the same URL.
 */
export function challenge(
  kind: string,
  options?: ChallengeOptions,
): AccessOutcome {
  return { type: "challenge", kind, soft: options?.soft };
}

export type AccessResolver = (
  ctx: AppContext,
) => AccessOutcome | Promise<AccessOutcome>;

export interface DefinePolicyInput {
  /**
   * The closed set of *custom* segments this policy's resolver may `grant`,
   * beyond the always-allowed built-ins. Granting anything outside this set
   * (∪ built-ins) is a developer error surfaced at resolution time.
   */
  readonly segments?: readonly string[];
  readonly resolve: AccessResolver;
}

export interface AccessPolicy {
  readonly segments: readonly string[];
  readonly resolve: AccessResolver;
}

export function definePolicy(input: DefinePolicyInput): AccessPolicy {
  return { segments: input.segments ?? [], resolve: input.resolve };
}

/** The closed output: one audience segment + one gate decision. */
export interface Access {
  readonly segment: Segment;
  readonly gate: Gate;
}

export class AccessError extends Error {
  static {
    AccessError.prototype.name = "AccessError";
  }

  readonly code: "segment_not_declared";

  private constructor(code: "segment_not_declared", message: string) {
    super(message);
    this.code = code;
  }

  static segmentNotDeclared(segment: string): AccessError {
    return new AccessError(
      "segment_not_declared",
      `resolveAccess: policy granted segment "${segment}", which is neither a built-in segment nor declared in the policy's segments space`,
    );
  }
}

/**
 * Map `(principal, policy) → { segment, gate }`. Pure: it runs the policy's
 * resolver (which may perform I/O) and translates the closed outcome, doing no
 * I/O itself. A `grant` of a segment outside the policy's declared space (∪
 * built-ins) throws — the closed-output contract, enforced.
 */
export async function resolveAccess(
  ctx: AppContext,
  policy: AccessPolicy,
): Promise<Access> {
  const outcome = await policy.resolve(ctx);
  switch (outcome.type) {
    case "grant": {
      if (
        !isBuiltinSegment(outcome.segment) &&
        !policy.segments.includes(outcome.segment)
      ) {
        throw AccessError.segmentNotDeclared(outcome.segment);
      }
      return { segment: outcome.segment, gate: { type: "allow" } };
    }
    case "redirect":
      // Nothing renders on a redirect; the visitor is anonymous by definition.
      return { segment: "anonymous", gate: { type: "redirect" } };
    case "challenge":
      // A challenge (hard 402/403 block, or a soft teaser) is keyed to the
      // principal's free built-in segment — `anonymous` or `authenticated` — so
      // every un-entitled visitor of the same kind shares one variant, distinct
      // from the entitled full render. `soft` rides through so the dispatcher
      // renders the teaser (soft) or blocks (hard).
      return {
        segment: principalSegment(ctx.user),
        gate: { type: "challenge", kind: outcome.kind, soft: outcome.soft },
      };
  }
}

const ROLE_PREFIX = "role:";

/** True for `anonymous`, `authenticated`, `private`, or `role:<known-role>`. */
export function isBuiltinSegment(segment: string): boolean {
  if (
    segment === "anonymous" ||
    segment === "authenticated" ||
    segment === PRIVATE_SEGMENT
  ) {
    return true;
  }
  if (!segment.startsWith(ROLE_PREFIX)) return false;
  return (USER_ROLES as readonly string[]).includes(
    segment.slice(ROLE_PREFIX.length),
  );
}

/** The free segment a principal falls into with no policy logic applied. */
export function principalSegment(
  user: AuthenticatedUser | null,
): "anonymous" | "authenticated" {
  return user ? "authenticated" : "anonymous";
}

/**
 * The global default: everyone is the `anonymous` audience and passes. Absence
 * of an attached policy is equivalent to this — un-policied routes behave
 * exactly as they do today.
 */
export const anonymousPolicy: AccessPolicy = definePolicy({
  resolve: () => grant("anonymous"),
});

/** Require any authenticated principal; redirect anonymous visitors to sign-in. */
export const authenticatedPolicy: AccessPolicy = definePolicy({
  resolve: (ctx) => (ctx.user ? grant("authenticated") : redirectToLogin()),
});

/**
 * Require at least `required` on the role ladder. Anonymous visitors are sent
 * to sign-in; an authenticated-but-under-privileged principal is denied with a
 * `"forbidden"` challenge (a terminal 403 — re-authenticating as themselves
 * wouldn't help, so a redirect would loop). The granted segment is the
 * *required* tier, so every sufficiently-privileged visitor shares one variant.
 */
export function rolePolicy(required: UserRole): AccessPolicy {
  return definePolicy({
    resolve: (ctx) => {
      if (!ctx.user) return redirectToLogin();
      if (roleLevel(ctx.user.role) >= roleLevel(required)) {
        return grant(`${ROLE_PREFIX}${required}`);
      }
      return challenge("forbidden");
    },
  });
}
