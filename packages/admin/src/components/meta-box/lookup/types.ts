// The admin-side view of a `lookup.list` / `lookup.resolve` row — the
// shape the reference pickers and the link field render. Structurally a
// `LookupResult` from the RPC (assignable without a cast); kept as its
// own admin type so the lookup hooks + render helpers don't reach back
// into a picker component for it.
export interface LookupItem {
  readonly id: string;
  readonly label: string | null;
  readonly targetType?: string;
  readonly subtitle?: string;
  /** Public URL of the row, when it has one — see `LookupResult.href`. */
  readonly href?: string;
}
