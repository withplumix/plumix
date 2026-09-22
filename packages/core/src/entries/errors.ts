/**
 * Domain error the entries read service throws. The `data` discriminant carries
 * exactly what each transport needs to render it — oRPC maps it to a typed error
 * via {@link toRpcEntryReadError}. Mirrors the per-domain error pattern in
 * `src/revisions/errors.ts`.
 */
export class EntryReadError extends Error {
  static {
    EntryReadError.prototype.name = "EntryReadError";
  }

  readonly data:
    | { readonly code: "not_found"; readonly entryId: number }
    | { readonly code: "forbidden"; readonly capability: string }
    | { readonly code: "reserved_type" };

  private constructor(data: EntryReadError["data"], message: string) {
    super(message);
    this.data = data;
  }

  static notFound(entryId: number): EntryReadError {
    return new EntryReadError(
      { code: "not_found", entryId },
      `entry ${entryId} not found`,
    );
  }

  static forbidden(capability: string): EntryReadError {
    return new EntryReadError(
      { code: "forbidden", capability },
      `missing capability: ${capability}`,
    );
  }

  static reservedType(type: string): EntryReadError {
    return new EntryReadError(
      { code: "reserved_type" },
      `reserved entry type: ${type}`,
    );
  }
}

/**
 * A query that cannot be built or compiled as asked: one `entryQuery` did not
 * mint, or an order naming a meta key with no JSON path. Neither is a domain
 * outcome, and neither is mapped to a transport — each says the code that
 * wrote the query is wrong, not that the request was.
 */
export class EntryQueryError extends Error {
  static {
    EntryQueryError.prototype.name = "EntryQueryError";
  }

  private constructor(message: string) {
    super(message);
  }

  static foreignQuery(): EntryQueryError {
    return new EntryQueryError(
      "not a query entryQuery() built: a query holds its narrowings beside itself, so one cannot be reconstructed or edited from outside",
    );
  }

  static metaKeyHasNoPath(key: string): EntryQueryError {
    return new EntryQueryError(
      `cannot order by meta key "${key}": a quote or a backslash has no JSON path SQLite can read, so no entry stores a value under it`,
    );
  }
}
