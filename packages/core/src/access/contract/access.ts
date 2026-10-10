import type { UserRole } from "../../db/schema/users.js";
import type { PRIVATE_SEGMENT } from "./segments.js";

/**
 * Segments derived from the loaded principal with no extra lookup. Custom
 * labels come only from `grant()`. `private` is never cached.
 */
export type BuiltinSegment =
  "anonymous" | "authenticated" | typeof PRIVATE_SEGMENT | `role:${UserRole}`;

/**
 * A membership or paywall label. Open-ended, unlike `role:`, so each label must
 * be declared in the policy's `segments` space.
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
   * A hard challenge ends in a 402 or 403 with no content. A `soft` one renders
   * at 200 so the theme can serve a teaser, cached under the visitor's segment.
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
