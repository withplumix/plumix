import type { AppContext } from "../context/app.js";

// Reference fields (entry / term / user / media) share three
// operations per target kind: write-time existence check, read-time
// orphan handling, admin picker search/list. `LookupAdapter` is the
// seam where each kind plugs them in once; core ships adapters for
// `entry` / `term` / `user`, plugins register their own via
// `PluginContext.registerLookupAdapter`.

export interface LookupResult {
  readonly id: string;
  readonly label: string;
  readonly subtitle?: string;
  /**
   * Adapter-provided cached fields. When the field's
   * `referenceTarget.valueShape === "object"`, the meta pipeline
   * merges these into the stored value on every write so reads can
   * render without a resolve round-trip. Examples: `mime`,
   * `filename` for media; could be `width`/`height` later.
   *
   * Picker UIs may also read `cached` to render preview thumbnails
   * (e.g. `cached.mime` to decide image vs file icon).
   */
  readonly cached?: Readonly<Record<string, unknown>>;
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
 *    pipeline (`validateMetaReferences` + `filterMetaOrphans`)
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
}

export interface RegisteredLookupAdapter<TScope = unknown> {
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
