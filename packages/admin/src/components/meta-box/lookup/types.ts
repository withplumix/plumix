/** Structurally a `LookupResult`, assignable without a cast. */
export interface LookupItem {
  readonly id: string;
  readonly label: string | null;
  readonly targetType?: string;
  readonly subtitle?: string;
  /** Public URL of the row, when it has one — see `LookupResult.href`. */
  readonly href?: string;
}
