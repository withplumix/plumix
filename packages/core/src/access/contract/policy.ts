/**
 * What a policy's `resolve` returns — the closed set of outcomes. Built via the
 * `grant` / `redirectToLogin` / `challenge` / `entitlement`
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

/**
 * A policy's resolver, over the context it reads. Generic so this contract
 * names no context: `AppContext` carries the plugin registry, which carries
 * these policies (ADR 0010). `access/policy.ts` fixes it to `AppContext` as
 * `AccessResolver`.
 */
export type AccessResolverFor<TContext> = (
  ctx: TContext,
) => AccessOutcome | Promise<AccessOutcome>;

/**
 * A resolver and the custom segments it may grant, over the context the
 * resolver reads. `access/policy.ts` fixes it to `AppContext` as
 * `AccessPolicy`.
 */
export interface AccessPolicyFor<TContext> {
  readonly segments: readonly string[];
  readonly resolve: AccessResolverFor<TContext>;
}
