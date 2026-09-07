type CliErrorCode =
  | "spawn_failed"
  | "spawn_nonzero_exit"
  | "unknown_command"
  | "unknown_subcommand"
  | "runtime_commands_not_found"
  | "runtime_commands_load_failed"
  | "migrate_generate_no_drizzle_kit"
  | "migrate_generate_failed"
  | "migrate_generate_journal_unreadable"
  | "raw_sql_migration_invalid_name"
  | "raw_sql_migration_duplicate"
  | "migrate_apply_missing_db"
  | "migrate_apply_no_d1"
  | "migrate_apply_ambiguous_db"
  | "config_not_found_explicit"
  | "config_not_found_default"
  | "config_load_failed"
  | "config_invalid"
  | "i18n_check_drift"
  | "i18n_verify_drift"
  | "i18n_init_no_package_json"
  | "i18n_init_invalid_package_json"
  | "tooling_command_no_app"
  | "deferred_command_no_app"
  | "cron_run_missing_expression"
  | "cron_run_unknown_schedule"
  | "cron_run_database_unavailable"
  | "cron_run_tasks_failed"
  | "cron_run_never_started"
  | "cron_run_invalid_expression";

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

  // A typo is user error. Without this it reaches the CLI as an unexpected
  // internal failure, which reads like a crash rather than a fixable mistake.
  static cronRunInvalidExpression(ctx: { detail: string }): CliError {
    return new CliError(
      "cron_run_invalid_expression",
      ctx.detail,
      "Run `plumix cron list` for the schedules this site declares.",
      // No `cause`: the parser's message is already the whole explanation, and
      // the CLI prints a cause underneath, which would just repeat it.
      undefined,
    );
  }

  static cronRunDatabaseUnavailable(ctx: {
    detail: string;
    cause: unknown;
  }): CliError {
    return new CliError(
      "cron_run_database_unavailable",
      `Could not reach the database a scheduled run writes through: ${ctx.detail}`,
      "Run `plumix migrate apply` if this deploy has not applied its migrations since upgrading, and check the database path resolves from this directory.",
      ctx.cause,
    );
  }

  // A caught task failure would otherwise leave the command exiting 0, so a
  // CronJob whose work all failed looks exactly like one that worked.
  static cronRunTasksFailed(ctx: {
    expression: string;
    failed: readonly string[];
  }): CliError {
    return new CliError(
      "cron_run_tasks_failed",
      `${String(ctx.failed.length)} scheduled task(s) failed on "${ctx.expression}": ${ctx.failed.join(", ")}`,
      "Each failure is logged above with its error. Siblings still ran.",
      undefined,
    );
  }

  // Distinct from a task failing: nothing ran, so the hint about siblings and
  // per-task logs would send the operator looking for the wrong thing.
  static cronRunNeverStarted(ctx: {
    expression: string;
    reason: string;
  }): CliError {
    return new CliError(
      "cron_run_never_started",
      `The run for "${ctx.expression}" failed before any task started: ${ctx.reason}`,
      "Nothing ran. Check the database and the bindings this deploy needs.",
      undefined,
    );
  }

  static cronRunMissingExpression(): CliError {
    return new CliError(
      "cron_run_missing_expression",
      "plumix cron run needs the schedule expression to fire",
      'Run `plumix cron list` for the schedules this site declares, then pass one, e.g. `plumix cron run "*/5 * * * *"`.',
      undefined,
    );
  }

  // Firing a schedule nothing declares would exit green having done nothing —
  // the silent failure an external scheduler is most likely to hit, since the
  // schedules come from the plugins a site installs.
  static cronRunUnknownSchedule(ctx: {
    expression: string;
    declared: readonly string[];
  }): CliError {
    return new CliError(
      "cron_run_unknown_schedule",
      `No scheduled task declares "${ctx.expression}", so firing it would run nothing`,
      ctx.declared.length > 0
        ? `This site declares: ${ctx.declared.map((c) => `"${c}"`).join(", ")}.`
        : "This site declares no scheduled tasks at all.",
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

  static migrateGenerateFailed(): CliError {
    return new CliError(
      "migrate_generate_failed",
      "drizzle-kit generate failed — migrations were not updated",
      "Its output is above. A prompt that needs a TTY means drizzle-kit is diffing against stale migrations and wants a column rename resolved: delete the `drizzle/` directory to regenerate from scratch, or rerun in an interactive terminal to answer it.",
      undefined,
    );
  }

  static migrateGenerateJournalUnreadable(ctx: {
    journalPath: string;
    cause: unknown;
  }): CliError {
    return new CliError(
      "migrate_generate_journal_unreadable",
      `Could not read the migration journal at ${ctx.journalPath}`,
      "A plugin contributes raw SQL migrations, which are numbered from this file. Delete the `drizzle/` directory to regenerate from scratch.",
      ctx.cause,
    );
  }

  static rawSqlMigrationInvalidName(ctx: {
    pluginId: string;
    name: string;
    pattern: string;
  }): CliError {
    return new CliError(
      "raw_sql_migration_invalid_name",
      `Plugin "${ctx.pluginId}" declares a raw SQL migration named "${ctx.name}"`,
      `A migration name becomes part of its filename, so it must match ${ctx.pattern}.`,
      undefined,
    );
  }

  static rawSqlMigrationDuplicate(ctx: { identity: string }): CliError {
    return new CliError(
      "raw_sql_migration_duplicate",
      `Two raw SQL migrations share the identity "${ctx.identity}"`,
      "An identity is a plugin id and a migration name joined — it is how the journal tells an already-emitted migration from a new one. Rename one of them.",
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

  static toolingCommandNoApp(ctx: { command: string }): CliError {
    return new CliError(
      "tooling_command_no_app",
      `plumix ${ctx.command}: ctx.app is not available — tooling commands run without a config`,
      "If this command needs the runtime app, dispatch it through the normal config-loading path.",
      undefined,
    );
  }

  static deferredCommandNoApp(ctx: { command: string }): CliError {
    return new CliError(
      "deferred_command_no_app",
      `plumix ${ctx.command}: ctx.app is not available — this command builds the app in its own runtime`,
      "Read the config from ctx.configPath instead, or clear `deferApp` if the command must consume the pre-built app.",
      undefined,
    );
  }

  static i18nCheckDrift(ctx: { ids: readonly string[] }): CliError {
    return new CliError(
      "i18n_check_drift",
      `Translation catalogs out of sync — ${ctx.ids.length} msgid(s) drifted (+ added, - removed):\n  ${ctx.ids.join("\n  ")}`,
      "Run `plumix i18n extract` locally and commit the updated `.po` file(s).",
      undefined,
    );
  }

  static i18nVerifyDrift(ctx: {
    missingInCatalog: readonly string[];
    orphanedInCatalog: readonly string[];
  }): CliError {
    const lines: string[] = [];
    for (const id of ctx.missingInCatalog) lines.push(`+ ${id}`);
    for (const id of ctx.orphanedInCatalog) lines.push(`- ${id}`);
    const total = ctx.missingInCatalog.length + ctx.orphanedInCatalog.length;
    return new CliError(
      "i18n_verify_drift",
      `Source ↔ catalog drift — ${total} msgid(s) (+ missing from catalog, - orphaned in catalog):\n  ${lines.join("\n  ")}`,
      "Add missing entries to `locales/en.po` (translators won't see them otherwise) and drop orphaned ones (dead translation work).",
      undefined,
    );
  }

  static i18nInitNoPackageJson(ctx: { cwd: string }): CliError {
    return new CliError(
      "i18n_init_no_package_json",
      `No package.json at ${ctx.cwd}`,
      "Run `plumix i18n init` from a package root, or scaffold one first with `pnpm init`.",
      undefined,
    );
  }

  static i18nInitInvalidPackageJson(ctx: {
    cwd: string;
    cause: unknown;
  }): CliError {
    return new CliError(
      "i18n_init_invalid_package_json",
      `Cannot parse package.json at ${ctx.cwd}`,
      "Fix the JSON syntax before re-running `plumix i18n init` — refusing to overwrite a malformed file.",
      ctx.cause,
    );
  }
}

export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError;
}
