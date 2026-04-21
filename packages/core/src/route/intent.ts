/**
 * Discriminated union describing what a matched URL represents. Resolved
 * into a Response by the public-route resolver. Kept narrow for now — the
 * arch doc specs `taxonomy` / `search` / `front-page` / `handler` /
 * `redirect`; those land when a plugin actually needs them.
 */
export type RouteIntent =
  | { readonly kind: "single"; readonly postType: string }
  | { readonly kind: "archive"; readonly postType: string };

/**
 * Compiled rule. `priority` preserves arch-doc ordering semantics — lower
 * number wins. Explicit `addRewriteRule` defaults to 10; auto-generated
 * rules from `hasArchive` / `rewrite.slug` land at 50.
 */
export interface RouteRule {
  readonly pattern: URLPattern;
  readonly rawPattern: string;
  readonly intent: RouteIntent;
  readonly priority: number;
}
