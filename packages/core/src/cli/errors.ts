type CliErrorCode =
  | "spawn_failed"
  | "spawn_nonzero_exit"
  | "unknown_command"
  | "unknown_subcommand"
  | "runtime_commands_not_found"
  | "runtime_commands_load_failed"
  | "migrate_generate_no_drizzle_kit"
  | "migrate_apply_missing_db"
  | "migrate_apply_no_d1"
  | "migrate_apply_ambiguous_db"
  | "config_not_found_explicit"
  | "config_not_found_default"
  | "config_load_failed"
  | "config_invalid";

export class CliError extends Error {
  static {
    CliError.prototype.name = "CliError";
  }

  readonly code: CliErrorCode;
  readonly hint: string | undefined;

  private constructor(
    code: CliErrorCode,
    message: string,
    hint: string | undefined,
    cause: unknown,
  ) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.code = code;
    this.hint = hint;
  }

  static spawnFailed(ctx: { command: string; cause: unknown }): CliError {
    return new CliError(
      "spawn_failed",
      `Failed to start ${ctx.command}`,
      `Is ${ctx.command} installed and on PATH?`,
      ctx.cause,
    );
  }

  static spawnNonzeroExit(ctx: {
    command: string;
    exitCode: number | null;
    signal: NodeJS.Signals | null;
  }): CliError {
    const detail = ctx.signal
      ? `signal ${ctx.signal}`
      : `code ${ctx.exitCode ?? "unknown"}`;
    return new CliError(
      "spawn_nonzero_exit",
      `${ctx.command} exited with ${detail}`,
      undefined,
      undefined,
    );
  }

  static unknownCommand(ctx: { command: string }): CliError {
    return new CliError(
      "unknown_command",
      `Unknown command: ${ctx.command}`,
      "Run `plumix help` to see available commands.",
      undefined,
    );
  }

  static unknownSubcommand(ctx: {
    command: string;
    subcommand: string | undefined;
    supported: readonly string[];
  }): CliError {
    const supported = ctx.supported
      .map((n) => `\`plumix ${ctx.command} ${n}\``)
      .join(", ");
    return new CliError(
      "unknown_subcommand",
      `Unknown subcommand: ${ctx.command} ${String(ctx.subcommand)}`,
      `Supported: ${supported}.`,
      undefined,
    );
  }

  static runtimeCommandsNotFound(ctx: {
    commandsModule: string;
    cwd: string;
    cause: unknown;
  }): CliError {
    return new CliError(
      "runtime_commands_not_found",
      `Runtime commands module not found: "${ctx.commandsModule}"`,
      `Install the runtime adapter package in ${ctx.cwd}.`,
      ctx.cause,
    );
  }

  static runtimeCommandsLoadFailed(ctx: {
    commandsModule: string;
    cause: unknown;
  }): CliError {
    return new CliError(
      "runtime_commands_load_failed",
      `Failed to load runtime commands from "${ctx.commandsModule}"`,
      "Check the runtime adapter's commands module for import errors.",
      ctx.cause,
    );
  }

  static migrateGenerateNoDrizzleKit(): CliError {
    return new CliError(
      "migrate_generate_no_drizzle_kit",
      "drizzle-kit could not be resolved",
      "drizzle-kit ships with plumix; rerun `pnpm install` to restore node_modules, or pin a specific version as a devDependency to override.",
      undefined,
    );
  }

  static migrateApplyMissingDb(): CliError {
    return new CliError(
      "migrate_apply_missing_db",
      "Missing D1 database name",
      "Pass the database name: `plumix migrate apply <database-name>`. Or add a wrangler.jsonc / wrangler.toml with a `d1_databases` entry so Plumix can auto-discover it.",
      undefined,
    );
  }

  static migrateApplyNoD1(ctx: { filename: string }): CliError {
    return new CliError(
      "migrate_apply_no_d1",
      `No d1_databases entries with a database_name in ${ctx.filename}`,
      "Add a `d1_databases` entry with a `database_name`, or pass the name explicitly: `plumix migrate apply <database-name>`.",
      undefined,
    );
  }

  static migrateApplyAmbiguousDb(ctx: {
    filename: string;
    names: readonly string[];
  }): CliError {
    return new CliError(
      "migrate_apply_ambiguous_db",
      `Multiple D1 databases found in ${ctx.filename}: ${ctx.names.join(", ")}`,
      "Pass the name explicitly: `plumix migrate apply <database-name>`.",
      undefined,
    );
  }

  static configNotFoundExplicit(ctx: {
    explicit: string;
    absolute: string;
  }): CliError {
    return new CliError(
      "config_not_found_explicit",
      `Config file not found: ${ctx.explicit}`,
      `Checked ${ctx.absolute}`,
      undefined,
    );
  }

  static configNotFoundDefault(ctx: { cwd: string }): CliError {
    return new CliError(
      "config_not_found_default",
      "No plumix.config.{ts,js,mjs} found",
      `Create plumix.config.ts in ${ctx.cwd} or pass --config <path>.`,
      undefined,
    );
  }

  static configLoadFailed(ctx: {
    configPath: string;
    cause: unknown;
  }): CliError {
    return new CliError(
      "config_load_failed",
      `Failed to load ${ctx.configPath}`,
      "Check the file for syntax errors and ensure every import resolves.",
      ctx.cause,
    );
  }

  static configInvalid(ctx: { configPath: string }): CliError {
    return new CliError(
      "config_invalid",
      `Invalid config shape in ${ctx.configPath}`,
      "Default export must be the return value of plumix({ ... }) or defineConfig({ ... }).",
      undefined,
    );
  }
}

export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError;
}
