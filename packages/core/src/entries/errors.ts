/** Map it to a typed oRPC error with {@link toRpcEntryReadError}. */
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
 * Not mapped to a transport: it means the code that wrote the query is wrong,
 * not the request.
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
