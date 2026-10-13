/**
 * What a policy's `resolve` returns — the closed set of outcomes. Call sites
 * build it with the constructors in `access/policy.ts`, never by hand.
 */
export type AccessOutcome =
  | { readonly type: "grant"; readonly segment: string }
  | { readonly type: "redirect" }
  | {
      readonly type: "challenge";
      readonly kind: string;
      readonly soft?: boolean;
    };

/** Generic over the context: `AppContext` carries the registry, which carries policies (ADR 0010). */
export type AccessResolverFor<TContext> = (
  ctx: TContext,
) => AccessOutcome | Promise<AccessOutcome>;

/** A resolver and the custom segments it may grant. */
export interface AccessPolicyFor<TContext> {
  readonly segments: readonly string[];
  readonly resolve: AccessResolverFor<TContext>;
}

/**
 * What a policy's gate lets its principal have of an entry. A soft challenge
 * lists the entry as a teaser; only `allow` hands over its body.
 */
export type EntryAdmission = "content" | "listing";

/** What one resolved outcome lets its principal have. */
export function admissionOf(
  outcome: AccessOutcome,
): EntryAdmission | "nothing" {
  if (outcome.type === "grant") return "content";
  if (outcome.type === "challenge" && outcome.soft === true) return "listing";
  return "nothing";
}

/** Whether an admission reaches `level`. */
export function admissionMeets(
  admits: EntryAdmission | "nothing",
  level: EntryAdmission,
): boolean {
  if (admits === "nothing") return false;
  return level === "listing" || admits === "content";
}
