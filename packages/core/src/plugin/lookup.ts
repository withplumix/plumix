import type { Capability } from "../access/contract/capability.js";
import type { AppContext } from "../context/app-context.js";
import type { ResolvedImage } from "../images/contract/role-images.js";

export interface LookupResult {
  readonly id: string;
  /**
   * `null` when the row has no human-authored label; the consumer renders its
   * own localized fallback.
   */
  readonly label: string | null;
  /**
   * Sub-kind of the row (entry type, taxonomy), so the picker resolves per-type
   * labels without parsing `subtitle`. Omitted by single-typed adapters.
   */
  readonly targetType?: string;
  readonly subtitle?: string;
  /** Public URL for the row; omitted when the row has none. */
  readonly href?: string;
}

/**
 * `id` is the stored reference id, so a hydrated value posted back through a
 * meta write reduces to the plain id.
 */
export interface HydratedReference {
  readonly id: string;
}

export interface LookupHydrateOptions<TScope = unknown> {
  readonly ids: readonly string[];
  readonly scope?: TScope;
}

/**
 * Hydrated shape per reference kind, keyed by adapter `kind`. Plugins add their
 * kinds by declaration merging.
 *
 * ```ts declare module "plumix" {
 *   interface ReferenceHydrationShapes {
 *     media: MediaReference;
 *   }
 * } ```
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
   * When set, the adapter ignores `query` and returns the matching rows (still
   * scoped) in any order.
   */
  readonly ids?: readonly string[];
}

/**
 * `TScope` is the field's `referenceTarget.scope`. Each method must answer in
 * one round-trip regardless of selection size.
 */
export interface LookupAdapter<TScope = unknown> {
  list(
    ctx: AppContext,
    options: LookupListOptions<TScope>,
  ): Promise<readonly LookupResult[]>;

  /**
   * Ids that are gone or out of scope must be absent from the result; absence
   * reads as an orphan. Kinds without it read as plain ids.
   */
  hydrate?(
    ctx: AppContext,
    options: LookupHydrateOptions<TScope>,
  ): Promise<readonly HydratedReference[]>;

  /**
   * Must return the same tag the entity's own purge enqueues. Takes the id, not
   * a payload: an id that hydrated to nothing still needs its tag.
   */
  embeddedCacheTags?(id: string): readonly string[];

  /**
   * Only ever handed a payload this adapter's own `hydrate` returned, so it may
   * narrow the parameter. `null` when the payload is not a usable image.
   */
  image?(payload: HydratedReference): ResolvedImage | null;
}

// Extends `LookupAdapterOptions` so plugin fields added by declaration merging
// survive into the manifest.
export interface RegisteredLookupAdapter<
  TScope = unknown,
> extends LookupAdapterOptions<TScope> {
  readonly kind: string;
  readonly adapter: LookupAdapter<TScope>;
  /**
   * Gates only the picker-facing lookup RPC; without it any signed-in user
   * could enumerate the adapter's rows. `null` makes the lookup public.
   */
  readonly capability: Capability | null;
  readonly registeredBy: string | null;
}

export interface LookupAdapterOptions<TScope = unknown> {
  readonly kind: string;
  readonly adapter: LookupAdapter<TScope>;
  /** `null` makes the lookup public. */
  readonly capability?: Capability | null;
}
