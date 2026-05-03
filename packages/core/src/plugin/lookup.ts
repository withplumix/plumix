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
}

export interface LookupListOptions<TScope = unknown> {
  readonly query?: string;
  readonly scope?: TScope;
  readonly limit?: number;
}

/**
 * `TScope` is the shape carried on the field's `referenceTarget.scope`
 * — e.g. `{ roles: UserRole[] }` for `user`. Adapters interpret it
 * however makes sense for their target. All methods are async so
 * future implementations can hit the database without a contract
 * break.
 */
export interface LookupAdapter<TScope = unknown> {
  /** Returning `false` surfaces as `invalid_value` in the meta write pipeline. */
  exists(ctx: AppContext, id: string, scope?: TScope): Promise<boolean>;

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
