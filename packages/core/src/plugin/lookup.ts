import type { AppContext } from "../context/app.js";

// Reference fields (entry / term / user / media) share three
// operations per target kind: write-time existence check, read-time
// orphan handling, admin picker search/list. `LookupAdapter` is the
// seam where each kind plugs them in once; core ships adapters for
// `entry` / `term` / `user`, plugins register their own via
// `PluginContext.registerLookupAdapter`.

export interface LookupResult {
  readonly id: string;
  /**
   * `null` signals the underlying row had no human-authored label and
   * the consumer should render its own localized fallback (e.g. the
   * admin picker renders an "Untitled" descriptor). Adapters that
   * can guarantee a non-empty string (term name, user email) keep
   * returning strings — only the entry adapter currently emits `null`.
   */
  readonly label: string | null;
  /**
   * Adapter-specific sub-kind for the row — entry type name (`"post"`,
   * `"page"`) for the entry adapter, taxonomy name (`"category"`) for
   * the term adapter. Lets the admin picker resolve per-type chrome
   * via the WP-style `labels[key]` cascade (e.g. `labels.untitledItem`
   * when `label === null`) without parsing the subtitle string.
   * Omitted for adapters whose universe is single-typed (`user`).
   */
  readonly targetType?: string;
  readonly subtitle?: string;
  /**
   * Public URL for the row, when it has one — entry permalink, term
   * archive. Read-time consumers (menu resolution) render links from
   * it; adapters whose rows have no public URL omit it.
   */
  readonly href?: string;
}

/**
 * Minimum shape of a batched-hydration payload. `id` is the stored
 * reference id (string form) so a hydrated value posted back through
 * a meta write self-heals to the plain id — the same `{ id, ... }`
 * extraction that migrates legacy snapshot values.
 */
export interface HydratedReference {
  readonly id: string;
}

export interface LookupHydrateOptions<TScope = unknown> {
  readonly ids: readonly string[];
  readonly scope?: TScope;
}

/**
 * Read-shape registry for reference kinds, keyed by adapter `kind`.
 * Core declares its own kinds; plugins augment via declaration
 * merging (`declare module "plumix/plugin"`), so the typed-meta layer
 * can resolve a reference field's hydrated value without core knowing
 * plugin-provided kinds.
 */
export interface ReferenceHydrationShapes {
  readonly entry: EntryReferenceSummary;
  readonly term: TermReferenceSummary;
  readonly user: UserReferenceSummary;
}

/** Hydrated shape of an `entry` reference — enough to render a link. */
export interface EntryReferenceSummary extends HydratedReference {
  readonly type: string;
  /** `null` mirrors `LookupResult.label`: no human-authored title. */
  readonly title: string | null;
  readonly slug: string;
  /** Permalink; `null` when the entry has no public URL. */
  readonly url: string | null;
}

/** Hydrated shape of a `term` reference. */
export interface TermReferenceSummary extends HydratedReference {
  readonly taxonomy: string;
  readonly name: string;
  readonly slug: string;
  /** Archive URL; `null` for private taxonomies / nested terms. */
  readonly url: string | null;
}

/** Hydrated shape of a `user` reference — public-safe columns only. */
export interface UserReferenceSummary extends HydratedReference {
  readonly name: string | null;
  readonly slug: string;
  readonly avatarUrl: string | null;
}

export interface LookupListOptions<TScope = unknown> {
  readonly query?: string;
  readonly scope?: TScope;
  readonly limit?: number;
  /**
   * Resolve-by-id batch: when set, the adapter ignores `query` and
   * returns rows whose id matches any in this list (still subject to
   * `scope`). Result order is up to the adapter — callers expecting
   * positional access should map to a `{ id -> result }` Map. Used
   * by the multi-reference orphan filter and the admin's
   * `MultiReferencePicker` so a 50-item field renders as one query
   * (single `WHERE id IN (...)`) rather than 50.
   */
  readonly ids?: readonly string[];
}

/**
 * `TScope` is the shape carried on the field's `referenceTarget.scope`
 * — e.g. `{ roles: UserRole[] }` for `user`. Adapters interpret it
 * however makes sense for their target.
 *
 * Two methods, one round-trip per call regardless of selection size:
 *  - `list` covers search/browse (no `ids`, optional `query`) and
 *    resolve-by-id batch (`ids` set, `query` ignored). The meta
 *    pipeline (`validateMetaReferences` + `hydrateMetaBags`)
 *    groups all reference fields by `(kind, scope)` and issues one
 *    `list({ ids })` per group, eliminating per-field N+1 on both
 *    reads and writes. The `MultiReferencePicker` batches the same
 *    way for label rendering.
 *  - `resolve` powers the single-reference admin picker (`lookup.
 *    resolve` RPC). One id per call but each picker on the page is
 *    its own component, so this stays simple.
 */
export interface LookupAdapter<TScope = unknown> {
  list(
    ctx: AppContext,
    options: LookupListOptions<TScope>,
  ): Promise<readonly LookupResult[]>;

  /** Returns `null` when the target is gone or no longer matches scope (orphan). */
  resolve(
    ctx: AppContext,
    id: string,
    scope?: TScope,
  ): Promise<LookupResult | null>;

  /**
   * Batched read-time hydration: resolve `ids` (subject to `scope`)
   * into this kind's hydrated shape (`ReferenceHydrationShapes[kind]`)
   * in one query. Ids that are gone or out of scope are simply absent
   * from the result — the meta pipeline reads absence as an orphan.
   * Optional: kinds without it read as plain ids (orphan-stripped via
   * `list({ ids })`, the pre-hydration behavior).
   */
  hydrate?(
    ctx: AppContext,
    options: LookupHydrateOptions<TScope>,
  ): Promise<readonly HydratedReference[]>;

  /**
   * Cache tags a hydrated payload contributes to the page that embeds it,
   * so editing or deleting the referenced entity purges the pages that
   * hydrated it (#1508). Called once per hydrated payload during
   * read-time hydration; the tags fold into the embedding page's stored
   * cache tags. Return the same tag the entity's own purge enqueues —
   * the entry adapter returns `e:<id>`, the precise per-entity tag. Kinds
   * whose entities carry no per-entity purge identity (e.g. `user`) omit
   * this method; their references embed without a cache-tag dependency.
   * Optional.
   */
  embeddedCacheTags?(payload: HydratedReference): readonly string[];
}

// `RegisteredLookupAdapter` extends `LookupAdapterOptions` so plugin-
// contributed fields (declaration-merged via TypeScript module
// augmentation) survive into the manifest. The `registerLookupAdapter`
// implementation spreads `options` to preserve them.
export interface RegisteredLookupAdapter<
  TScope = unknown,
> extends LookupAdapterOptions<TScope> {
  readonly kind: string;
  readonly adapter: LookupAdapter<TScope>;
  /**
   * Capability the lookup RPC requires for `list` / `resolve` calls
   * targeting this kind. Without it, any authenticated user could
   * enumerate the adapter's universe — a real concern for `user` /
   * `entry` whose rows leak email/name/title to lower-privilege
   * roles. Server-side write validation (the meta pipeline calling
   * `exists`) already runs after the entity-level write capability
   * check, so this gate covers only the picker-facing surface.
   */
  readonly capability: string | null;
  readonly registeredBy: string | null;
}

export interface LookupAdapterOptions<TScope = unknown> {
  readonly kind: string;
  readonly adapter: LookupAdapter<TScope>;
  /** See `RegisteredLookupAdapter.capability`. `null` opts out (public lookup). */
  readonly capability?: string | null;
}
