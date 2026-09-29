import type { UserRole } from "../../db/schema/users.js";
import type { PRIVATE_SEGMENT } from "./segments.js";

/**
 * Audience segments derived for free from the loaded principal — no extra
 * lookup. `entitlement:<label>` and other custom labels come only from a
 * developer `grant()` and are declared in the policy's `segments` space.
 * `private` is the reserved never-cached escape hatch.
 */
export type BuiltinSegment =
  "anonymous" | "authenticated" | typeof PRIVATE_SEGMENT | `role:${UserRole}`;

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

/** The closed output: one audience segment + one gate decision. */
export interface Access {
  readonly segment: Segment;
  readonly gate: Gate;
}
