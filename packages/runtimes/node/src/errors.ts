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
