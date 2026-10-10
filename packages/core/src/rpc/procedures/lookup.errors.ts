type LookupScopeErrorCode =
  | "entry_types_required"
  | "term_taxonomies_required"
  | "invalid_entry_status"
  | "reserved_entry_type";

/**
 * Thrown at runtime, not only at the type level, because a wire caller could
 * omit the scope and turn the picker into an unscoped enumeration channel.
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

  static reservedEntryType(type: string): LookupScopeError {
    return new LookupScopeError(
      "reserved_entry_type",
      `entry adapter: scope.entryTypes names the reserved type "${type}"`,
    );
  }

  static termTaxonomiesRequired(): LookupScopeError {
    return new LookupScopeError(
      "term_taxonomies_required",
      "term adapter: scope.termTaxonomies is required and must be non-empty",
    );
  }
}
