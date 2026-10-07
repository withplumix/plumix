export class MigrationsError extends Error {
  static {
    MigrationsError.prototype.name = "MigrationsError";
  }

  readonly code: "database_not_bun_sqlite";
  readonly kind: string;

  private constructor(
    code: "database_not_bun_sqlite",
    message: string,
    kind: string,
  ) {
    super(message);
    this.code = code;
    this.kind = kind;
  }

  static databaseNotBunSqlite(ctx: { kind: string }): MigrationsError {
    return new MigrationsError(
      "database_not_bun_sqlite",
      `@plumix/runtime-bun: \`plumix migrate\` applies to the file \`bunSqlite()\` names, ` +
        `but the config's database slot is "${ctx.kind}". Apply its migrations with that database's own tooling.`,
      ctx.kind,
    );
  }
}

export class BunConfigError extends Error {
  static {
    BunConfigError.prototype.name = "BunConfigError";
  }

  readonly code: "idle_timeout_too_long";

  private constructor(code: "idle_timeout_too_long", message: string) {
    super(message);
    this.code = code;
  }

  static idleTimeoutTooLong(ctx: { idleTimeout: number }): BunConfigError {
    return new BunConfigError(
      "idle_timeout_too_long",
      `@plumix/runtime-bun: bun() needs \`idleTimeout\` to be at most ${String(MAX_IDLE_TIMEOUT_S)} seconds, ` +
        `Bun's ceiling, got ${String(ctx.idleTimeout)}. Use 0 to disable it.`,
    );
  }
}

/** The longest idle timeout `Bun.serve` accepts, in seconds. */
export const MAX_IDLE_TIMEOUT_S = 255;

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
      `@plumix/runtime-bun: diskStorage refuses the key "${ctx.key}", which does not resolve under its directory`,
      ctx.key,
    );
  }
}

export class ImagesError extends Error {
  static {
    ImagesError.prototype.name = "ImagesError";
  }

  readonly code: "invalid_widths" | "upstream";
  /** What the route answers in place of the variant. */
  readonly status: number;

  private constructor(
    code: ImagesError["code"],
    message: string,
    status: number,
  ) {
    super(message);
    this.code = code;
    this.status = status;
  }

  static invalidWidths(ctx: { widths: readonly number[] }): ImagesError {
    return new ImagesError(
      "invalid_widths",
      `@plumix/runtime-bun: images() needs \`widths\` to be a non-empty list of positive integers, got ${JSON.stringify(ctx.widths)}`,
      500,
    );
  }

  static upstream(ctx: { status: number }): ImagesError {
    return new ImagesError(
      "upstream",
      `@plumix/runtime-bun: the image source answered ${String(ctx.status)}`,
      ctx.status,
    );
  }
}
