// What a response read and what a write changed, in the domain's terms. The
// CDN and the request memo both turn these into cache tags, through one rule
// in `cdn/invalidation.ts`, so the tag a read is stored under and the tag a
// write purges come from the same place (ADR 0042).
//
// A `contract/` half because the plugin contracts name them: a lookup adapter
// says what an embedded id reads, and an archive or a view says what its
// resolution read.

/** Something a response read. */
export type CacheRead =
  /** One entry, by id: its permalink, or a page that embedded it. */
  | { readonly kind: "entry"; readonly id: number }
  /** Any entry of a type, as a listing, an archive or a feed reads them. */
  | { readonly kind: "entryType"; readonly type: string }
  /** A taxonomy's terms and the entries they list, as a term archive reads them. */
  | { readonly kind: "taxonomy"; readonly taxonomy: string }
  /** One term, by id: a menu item or a reference that shows its name or link. */
  | { readonly kind: "term"; readonly id: number }
  /** One user, by id: a reference that shows their name or image. */
  | { readonly kind: "user"; readonly id: number }
  /** A settings group. */
  | { readonly kind: "settings"; readonly group: string }
  /**
   * A plugin's own record, read under a namespace of its own: a menu, a
   * comment thread. Purged only by a write naming the same namespace and id.
   */
  | {
      readonly kind: "own";
      readonly namespace: string;
      readonly id?: string | number;
    };

/** Something a write changed. */
export type CacheWrite =
  | { readonly kind: "entry"; readonly id: number; readonly type: string }
  | { readonly kind: "term"; readonly id: number; readonly taxonomy: string }
  | { readonly kind: "user"; readonly id: number }
  | { readonly kind: "settings"; readonly group: string }
  | {
      readonly kind: "own";
      readonly namespace: string;
      readonly id?: string | number;
    };
