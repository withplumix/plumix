export class MigrateApplyError extends Error {
  static {
    MigrateApplyError.prototype.name = "MigrateApplyError";
  }

  readonly code: "database_not_node_sqlite";
  readonly kind: string;

  private constructor(
    code: "database_not_node_sqlite",
    message: string,
    kind: string,
  ) {
    super(message);
    this.code = code;
    this.kind = kind;
  }

  static databaseNotNodeSqlite(ctx: { kind: string }): MigrateApplyError {
    return new MigrateApplyError(
      "database_not_node_sqlite",
      `@plumix/runtime-node: \`migrate apply\` applies to the file \`nodeSqlite()\` names, ` +
        `but the config's database slot is "${ctx.kind}". Apply its migrations with that database's own tooling.`,
      ctx.kind,
    );
  }
}

export class BridgeError extends Error {
  static {
    BridgeError.prototype.name = "BridgeError";
  }

  readonly code: "body_too_large";
  readonly limit: number;

  private constructor(code: "body_too_large", message: string, limit: number) {
    super(message);
    this.code = code;
    this.limit = limit;
  }

  static bodyTooLarge(ctx: { limit: number }): BridgeError {
    return new BridgeError(
      "body_too_large",
      `@plumix/runtime-node: the request body exceeds the ${ctx.limit} byte limit`,
      ctx.limit,
    );
  }
}

export class StorageError extends Error {
  static {
    StorageError.prototype.name = "StorageError";
  }

  readonly code: "key_escapes_directory";
  readonly key: string;

  private constructor(
    code: "key_escapes_directory",
    message: string,
    key: string,
  ) {
    super(message);
    this.code = code;
    this.key = key;
  }

  static keyEscapesDirectory(ctx: { key: string }): StorageError {
    return new StorageError(
      "key_escapes_directory",
      `@plumix/runtime-node: diskStorage refuses the key "${ctx.key}", which does not resolve under its directory`,
      ctx.key,
    );
  }
}

export class ImagesError extends Error {
  static {
    ImagesError.prototype.name = "ImagesError";
  }

  readonly code:
    "sharp_missing" | "invalid_widths" | "invalid_cache_size" | "upstream";
  /** For `upstream`: the status the route answers with. */
  readonly status: number | undefined;

  private constructor(
    code: ImagesError["code"],
    message: string,
    options?: ErrorOptions & { status?: number },
  ) {
    super(message, options);
    this.code = code;
    this.status = options?.status;
  }

  static sharpMissing(ctx: { cause: unknown }): ImagesError {
    return new ImagesError(
      "sharp_missing",
      "@plumix/runtime-node: images() transforms with `sharp`, which is not installed. " +
        "Add it to the project: `pnpm add sharp`.",
      { cause: ctx.cause },
    );
  }

  /** The source could not be turned into bytes; `status` is what the route answers. */
  static upstream(ctx: { status: number }): ImagesError {
    return new ImagesError(
      "upstream",
      `@plumix/runtime-node: the image source answered ${String(ctx.status)}`,
      { status: ctx.status },
    );
  }

  static invalidCacheSize(ctx: { cacheSize: number }): ImagesError {
    return new ImagesError(
      "invalid_cache_size",
      `@plumix/runtime-node: images() needs \`cacheSize\` to be a positive number of bytes, got ${String(ctx.cacheSize)}`,
    );
  }

  static invalidWidths(ctx: { widths: readonly number[] }): ImagesError {
    return new ImagesError(
      "invalid_widths",
      `@plumix/runtime-node: images() needs \`widths\` to be a non-empty list of positive integers, got ${JSON.stringify(ctx.widths)}`,
    );
  }
}
