/**
 * Access policies — the "open logic, closed output" core.
 *
 * A policy pairs a developer-supplied resolver (`(ctx) => Outcome`, whose
 * decision logic is unconstrained — role, capability, a `meta` flag, an
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
 * Audience segments derived for free from the loaded principal — no extra
 * lookup. `entitlement:<label>` and other custom labels come only from a
 * developer `grant()` and are declared in the policy's `segments` space.
 */
export type BuiltinSegment = "anonymous" | "authenticated" | `role:${UserRole}`;

/**
 * A resolved audience segment: a built-in or a custom label. `(string & {})`
 * keeps custom labels assignable while preserving autocomplete for the
 * built-ins.
 */
export type Segment = BuiltinSegment | (string & {});

/** The gate decision one policy resolution yields. Closed union. */
export type Gate =
  | { readonly type: "allow" }
  /** Redirect an anonymous visitor to sign-in, returning them afterwards. */
  | { readonly type: "redirect" }
  /** Render a challenge result (a 402 upsell, a 403 denial). */
  | { readonly type: "challenge"; readonly kind: string };

/**
 * What a policy's `resolve` returns — the closed set of outcomes. Built via the
 * {@link grant} / {@link redirectToLogin} / {@link challenge} constructors so
 * call sites never hand-shape the discriminated union.
 */
export type AccessOutcome =
  | { readonly type: "grant"; readonly segment: string }
  | { readonly type: "redirect" }
  | { readonly type: "challenge"; readonly kind: string };

/** Grant access, tagging the render with `segment` (a built-in or declared). */
export function grant(segment: string): AccessOutcome {
  return { type: "grant", segment };
}

/** Send an anonymous visitor to sign-in (returned afterwards via `redirectTo`). */
export function redirectToLogin(): AccessOutcome {
  return { type: "redirect" };
}

/** Block with a challenge (`"subscribe"` upsell, `"forbidden"` denial, …). */
export function challenge(kind: string): AccessOutcome {
  return { type: "challenge", kind };
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
      // The challenge result (upsell / denial) is keyed to the principal's free
      // built-in segment, so two lapsed subscribers share one variant.
      return {
        segment: principalSegment(ctx.user),
        gate: { type: "challenge", kind: outcome.kind },
      };
  }
}

const ROLE_PREFIX = "role:";

/** True for `anonymous`, `authenticated`, or `role:<known-role>`. */
export function isBuiltinSegment(segment: string): boolean {
  if (segment === "anonymous" || segment === "authenticated") return true;
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
