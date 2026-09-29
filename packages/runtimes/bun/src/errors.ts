export class MigrateApplyError extends Error {
  static {
    MigrateApplyError.prototype.name = "MigrateApplyError";
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

  static databaseNotBunSqlite(ctx: { kind: string }): MigrateApplyError {
    return new MigrateApplyError(
      "database_not_bun_sqlite",
      `@plumix/runtime-bun: \`migrate apply\` applies to the file \`bunSqlite()\` names, ` +
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
