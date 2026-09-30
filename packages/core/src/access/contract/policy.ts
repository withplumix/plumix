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
