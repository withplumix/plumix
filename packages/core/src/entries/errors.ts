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
 * A query handed to `compileEntryQuery` that `entryQuery` did not build. Not a
 * domain outcome and not mapped to a transport: it says a query was
 * reconstructed from outside, which is the one way the narrowing guarantee
 * could be lost without anyone writing an assertion.
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
}
