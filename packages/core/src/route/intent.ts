/**
 * Discriminated union describing what a matched URL represents. Resolved
 * into a Response by the public-route resolver. URL params (slug, term,
 * page) live on `RouteMatch.params`, not on the intent itself — the
 * intent describes the *route shape*, the match carries the request.
 *
 * `search` / `front-page` / `handler` / `redirect` land when a plugin
 * actually needs them.
 */
export type RouteIntent =
  | { readonly kind: "single"; readonly entryType: string }
  | { readonly kind: "archive"; readonly entryType: string }
  | { readonly kind: "taxonomy"; readonly taxonomy: string };

/**
 * Compiled rule. `priority` preserves arch-doc ordering semantics — lower
 * number wins. Explicit `registerRewriteRule` defaults to 10; auto-generated
 * rules from `hasArchive` / `rewrite.slug` land at 50.
 */
export interface RouteRule {
  readonly pattern: URLPattern;
  readonly rawPattern: string;
  readonly intent: RouteIntent;
  readonly priority: number;
}
