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
