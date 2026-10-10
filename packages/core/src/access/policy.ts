import type { AppContext, AuthenticatedUser } from "../context/app-context.js";
import type { UserRole } from "../db/schema/users.js";
import type { Access, EntitlementSegment } from "./contract/access.js";
import type {
  AccessOutcome,
  AccessPolicyFor,
  AccessResolverFor,
} from "./contract/policy.js";
import { USER_ROLES } from "../db/schema/users.js";
import { roleLevel } from "./contract/rbac.js";
import { PRIVATE_SEGMENT } from "./contract/segments.js";

export type {
  Access,
  BuiltinSegment,
  EntitlementSegment,
  Gate,
  Segment,
} from "./contract/access.js";
export type { AccessOutcome } from "./contract/policy.js";

const ENTITLEMENT_PREFIX = "entitlement:";

/** Build the `entitlement:<label>` segment string for a policy's `segments`. */
export function entitlementSegment(label: string): EntitlementSegment {
  return `${ENTITLEMENT_PREFIX}${label}`;
}

/** Options for {@link challenge}. */
export interface ChallengeOptions {
  /**
   * Renders at 200 with {@link Access} on `ctx.access` instead of a 402/403.
   * The teaser is a public, shared-cached document; a client-only lock over a
   * delivered body is not protection.
   */
  readonly soft?: boolean;
}

/** Grant access, tagging the render with `segment` (a built-in or declared). */
export function grant(segment: string): AccessOutcome {
  return { type: "grant", segment };
}

/**
 * Declare the same label in the policy's `segments` via
 * {@link entitlementSegment}, or resolution throws.
 */
export function entitlement(label: string): AccessOutcome {
  return grant(entitlementSegment(label));
}

/**
 * Send an anonymous visitor to sign-in (returned afterwards via `redirectTo`).
 */
export function redirectToLogin(): AccessOutcome {
  return { type: "redirect" };
}

/** Hard by default: a terminal challenge response. */
export function challenge(
  kind: string,
  options?: ChallengeOptions,
): AccessOutcome {
  return { type: "challenge", kind, soft: options?.soft };
}

export type AccessResolver = AccessResolverFor<AppContext>;

export interface DefinePolicyInput {
  /**
   * The closed set of *custom* segments this policy's resolver may `grant`,
   * beyond the always-allowed built-ins. Granting anything outside this set
   * (∪ built-ins) is a developer error surfaced at resolution time.
   */
  readonly segments?: readonly string[];
  readonly resolve: AccessResolver;
}

export type AccessPolicy = AccessPolicyFor<AppContext>;

export function definePolicy(input: DefinePolicyInput): AccessPolicy {
  return { segments: input.segments ?? [], resolve: input.resolve };
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
 * Throws {@link AccessError} when the resolver grants a segment that is neither
 * built in nor declared in the policy's `segments`.
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
      // Keyed to the free segment so every un-entitled visitor of a kind shares
      // one variant, distinct from the entitled render.
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
 * Equivalent to no policy. A privileged request (session, `Authorization`,
 * `?preview=`) still renders `private`, so it never enters the shared cache.
 */
export const anonymousPolicy: AccessPolicy = definePolicy({
  resolve: () => grant("anonymous"),
});

/**
 * Require any authenticated principal; redirect anonymous visitors to sign-in.
 */
export const authenticatedPolicy: AccessPolicy = definePolicy({
  resolve: (ctx) => (ctx.user ? grant("authenticated") : redirectToLogin()),
});

/**
 * An under-privileged principal gets a 403, since redirecting to sign-in would
 * loop. Grants the *required* tier, so all qualifying visitors share one
 * variant.
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
