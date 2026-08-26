import type { EntryTypeOptions, TermTaxonomyOptions } from "plumix/plugin";

/**
 * Replace an array-valued field, or compose it against the plugin's default.
 * Same `(prev) => next` convention core uses for template-dep slugs.
 */
type Composable<T> = T | ((prev: T) => T);

/**
 * A partial of the registration options, derived from them rather than
 * hand-listed — a field added to `EntryTypeOptions` becomes overridable with no
 * edit here, and one removed stops compiling. The registered *name* is absent
 * by construction: it is the `registerEntryType` argument, not an option, which
 * is what keeps `entries.type` rows and `forEntryType("post")` valid.
 */
type Overridable<O> = {
  readonly [K in keyof O]?: O[K] extends readonly unknown[] | undefined
    ? Composable<NonNullable<O[K]>>
    : O[K];
};

/** `false` skips the registration entirely. */
export type EntryTypeOverride = Overridable<EntryTypeOptions> | false;
export type TermTaxonomyOverride = Overridable<TermTaxonomyOptions> | false;

export interface RelatedPostsOptions {
  /** Cards in the strip. Defaults to three. */
  readonly limit?: number;
}

export interface BlogOptions {
  readonly post?: EntryTypeOverride;
  readonly category?: TermTaxonomyOverride;
  readonly tag?: TermTaxonomyOverride;
  /**
   * The related-by-term strip on the single-post view. `false` skips the
   * template dep, so a theme that never declares `relatedPosts` pays nothing.
   */
  readonly relatedPosts?: false | RelatedPostsOptions;
}

/**
 * Fold a site override over the plugin's registration, one level of merge per
 * field: object-valued fields (`labels`, `rewrite`, `versioning`) merge
 * key-by-key so overriding one label doesn't drop the rest; arrays and scalars
 * replace, or compose via `(prev) => next`.
 */
export function applyOverride<O extends object>(
  defaults: O,
  override: Overridable<O> | undefined,
): O {
  if (override === undefined) return defaults;
  // Safety: `O` is a registration-options interface, so it has no index
  // signature to spread through structurally. Every key walked below comes from
  // `override`, which is keyed by `keyof O`.
  const out = { ...defaults } as Record<string, unknown>;
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    const base = out[key];
    if (typeof value === "function") {
      // Safety: `Composable` only wraps array-valued fields, so the function
      // form is always `(prev: T[]) => T[]`. An absent default seeds `[]` so a
      // compose callback never has to guard for it.
      const compose = value as (prev: readonly unknown[]) => readonly unknown[];
      out[key] = compose(Array.isArray(base) ? base : []);
    } else if (isPlainObject(base) && isPlainObject(value)) {
      out[key] = { ...base, ...value };
    } else {
      out[key] = value;
    }
  }
  return out as O;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
