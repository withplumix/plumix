type LookupScopeErrorCode =
  "entry_types_required" | "term_taxonomies_required" | "invalid_entry_status";

/**
 * A lookup adapter was called without the scope filter that enforces
 * per-type / per-taxonomy read scoping. Thrown at runtime (not just the
 * builder's TS level) because a wire-side caller could omit it and turn the
 * picker into an unscoped enumeration channel. Named-error convention (#232).
 */
export class LookupScopeError extends Error {
  static {
    LookupScopeError.prototype.name = "LookupScopeError";
  }

  readonly code: LookupScopeErrorCode;

  private constructor(code: LookupScopeErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  static entryTypesRequired(): LookupScopeError {
    return new LookupScopeError(
      "entry_types_required",
      "entry adapter: scope.entryTypes is required and must be non-empty",
    );
  }

  static invalidEntryStatus(): LookupScopeError {
    return new LookupScopeError(
      "invalid_entry_status",
      "entry adapter: scope.status must be a known entry status",
    );
  }

  static termTaxonomiesRequired(): LookupScopeError {
    return new LookupScopeError(
      "term_taxonomies_required",
      "term adapter: scope.termTaxonomies is required and must be non-empty",
    );
  }
}
