/**
 * Discriminated union describing what a matched URL represents. Resolved
 * into a Response by the public-route resolver. URL params (slug, term,
 * page) live on `RouteMatch.params`, not on the intent itself — the
 * intent describes the *route shape*, the match carries the request.
 */
export type RouteIntent =
  | { readonly kind: "single"; readonly entryType: string }
  | { readonly kind: "archive"; readonly entryType: string }
  | { readonly kind: "taxonomy"; readonly taxonomy: string }
  | { readonly kind: "author" }
  | { readonly kind: "date" }
  | { readonly kind: "front-page" }
  | { readonly kind: "search" }
  // A plugin-registered archive type (`registerArchiveType`); `name` looks the
  // resolver up on the registry. This is the open seam — new archive types are
  // registered, not added to this union.
  | { readonly kind: "custom"; readonly name: string };

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
