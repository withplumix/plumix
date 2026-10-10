/**
 * What a matched URL represents. It describes the route shape; params live on
 * `RouteMatch.params`.
 */
export type RouteIntent =
  // `slug` names one fixed entry, found whatever the URL captured; without it
  // the entry is the one the captured `path` or `slug` param addresses.
  | {
      readonly kind: "entry";
      readonly entryType: string;
      readonly slug?: string;
    }
  | { readonly kind: "entryType"; readonly entryType: string }
  | { readonly kind: "term"; readonly taxonomy: string }
  | { readonly kind: "author" }
  | { readonly kind: "date" }
  | { readonly kind: "frontPage" }
  | { readonly kind: "search" }
  // A plugin-registered archive type (`registerArchiveType`); `name` looks the
  // resolver up on the registry. This is the open seam — new archive types are
  // registered, not added to this union.
  | { readonly kind: "archiveType"; readonly name: string }
  // A plugin-registered view (`registerView`): a per-visitor app page that
  // lists nothing. `name` looks the resolver up on the registry.
  | { readonly kind: "view"; readonly name: string };

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
  /**
   * Compiled from a registration's permalink configuration, so core emits and
   * canonicalizes its URLs. `registeredBy` can't tell this apart, as auto rules
   * set it too.
   */
  readonly isPermalinkRoute: boolean;
}
