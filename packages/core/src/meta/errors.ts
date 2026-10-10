type MetaReferenceErrorCode =
  "scope_not_serializable" | "batch_size_exceeded" | "meta_key_forbidden_chars";

/**
 * Thrown for an unserializable scope, a batch past the hard cap, or a meta key
 * with characters forbidden in a JSON path.
 */
export class MetaReferenceError extends Error {
  static {
    MetaReferenceError.prototype.name = "MetaReferenceError";
  }

  readonly code: MetaReferenceErrorCode;

  private constructor(
    code: MetaReferenceErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.code = code;
  }

  static scopeNotSerializable(
    kind: string,
    cause: unknown,
  ): MetaReferenceError {
    return new MetaReferenceError(
      "scope_not_serializable",
      `lookup adapter scope for kind "${kind}" must be JSON-serializable`,
      { cause },
    );
  }

  static batchSizeExceeded(
    callsite: string,
    size: number,
    limit: number,
  ): MetaReferenceError {
    return new MetaReferenceError(
      "batch_size_exceeded",
      `${callsite}: aggregated batch size ${size} exceeds MAX_REFERENCE_GROUP_BATCH (${limit})`,
    );
  }

  static metaKeyForbiddenChars(key: string): MetaReferenceError {
    return new MetaReferenceError(
      "meta_key_forbidden_chars",
      `meta key "${key}" contains characters forbidden in a JSON path`,
    );
  }
}
