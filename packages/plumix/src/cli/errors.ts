import { CliError } from "@plumix/core/cli";

type PlumixCliErrorCode =
  | "unknown_command"
  | "cron_run_invalid_expression"
  | "meta_database_unreachable"
  | "meta_invalid_arguments"
  | "meta_settle_unconfirmed"
  | "cron_run_database_unavailable"
  | "cron_run_tasks_failed"
  | "cron_run_never_started"
  | "cron_run_missing_expression"
  | "cron_run_unknown_schedule"
  | "unknown_subcommand"
  | "unknown_option"
  | "runtime_commands_not_found"
  | "runtime_commands_load_failed"
  | "migrate_generate_no_drizzle_kit"
  | "migrate_generate_failed"
  | "migrate_invalid_arguments"
  | "migrate_runtime_unsupported"
  | "migrate_fresh_production"
  | "migrate_unconfirmed"
  | "migrate_fresh_unconfirmed"
  | "migrate_fresh_name_mismatch"
  | "migrate_schema_module_unresolved"
  | "migrate_owner_history_missing"
  | "migrate_adoption_mismatch"
  | "migrate_site_drifted"
  | "migrate_data_module_unresolved"
  | "migrate_data_duplicate_name"
  | "migrate_data_failed"
  | "config_not_found_explicit"
  | "config_not_found_default"
  | "config_load_failed"
  | "config_invalid"
  | "tooling_command_no_app"
  | "deferred_command_no_app"
  | "i18n_check_drift"
  | "i18n_verify_drift"
  | "i18n_extract_hand_authored"
  | "i18n_compile_failed"
  | "i18n_init_no_package_json"
  | "i18n_init_invalid_package_json"
  | "port_flag_missing_value"
  | "port_flag_out_of_range"
  | "dev_host_empty"
  | "dev_environment_not_runnable"
  | "sync_invalid_arguments"
  | "sync_push_unconfirmed"
  | "sync_runtime_unsupported"
  | "sync_remote_url_required"
  | "sync_remote_token_missing"
  | "sync_dump_invalid"
  | "sync_settle_failed"
  | "sync_settle_refused"
  | "import_invalid_arguments"
  | "import_unconfirmed"
  | "import_records_invalid"
  | "mail_invalid_arguments"
  | "mail_not_configured"
  | "mail_send_failed"
  | "mail_site_unreachable"
  | "mail_remote_url_required"
  | "mail_remote_token_missing"
  | "mail_remote_refused"
  | "device_authorization_failed";

/**
 * The errors only this package throws. Internal: a runtime adapter declares
 * its own subclass rather than borrowing these codes.
 */
export class PlumixCliError extends CliError<PlumixCliErrorCode> {
  static unknownOption(ctx: {
    command: string;
    option: string;
    runtime: string;
  }): PlumixCliError {
    return new PlumixCliError(
      "unknown_option",
      `plumix ${ctx.command} takes no ${ctx.option} on the ${ctx.runtime} runtime`,
      "Run `plumix --help` for the options this site's runtime adds.",
      undefined,
    );
  }

  static unknownCommand(ctx: { command: string }): PlumixCliError {
    return new PlumixCliError(
      "unknown_command",
      `Unknown command: ${ctx.command}`,
      "Run `plumix help` to see available commands.",
      undefined,
    );
  }

  /**
   * A typo is user error. Without this it reaches the CLI as an unexpected
   * internal failure, which reads like a crash rather than a fixable mistake.
   */
  static cronRunInvalidExpression(ctx: { detail: string }): PlumixCliError {
    return new PlumixCliError(
      "cron_run_invalid_expression",
      ctx.detail,
      "Run `plumix cron list` for the schedules this site declares.",
      // No `cause`: the parser's message is already the whole explanation, and
      // the CLI prints a cause underneath, which would just repeat it.
      undefined,
    );
  }

  /**
   * A Cloudflare D1 binding exists only inside the Worker, so a Node process
   * has no database.
   */
  static metaDatabaseUnreachable(ctx: {
    detail: string;
    cause: unknown;
  }): PlumixCliError {
    return new PlumixCliError(
      "meta_database_unreachable",
      `Could not reach the site's database from here: ${ctx.detail}`,
      "Run `plumix migrate` with the same options if the database is new. `--binding <name>` picks one of several databases, and the target options `plumix --help` lists for the runtime, such as Cloudflare's `--production`, `--preview` and `--env <name>`, name a deployed one.",
      ctx.cause,
    );
  }

  static cronRunDatabaseUnavailable(ctx: {
    detail: string;
    cause: unknown;
  }): PlumixCliError {
    return new PlumixCliError(
      "cron_run_database_unavailable",
      `Could not reach the database a scheduled run writes through: ${ctx.detail}`,
      "Run `plumix migrate` if this deploy has not applied its migrations since upgrading, and check the database path resolves from this directory.",
      ctx.cause,
    );
  }

  /**
   * A caught task failure would otherwise leave the command exiting 0, so a
   * CronJob whose work all failed looks exactly like one that worked.
   */
  static cronRunTasksFailed(ctx: {
    expression: string;
    failed: readonly string[];
  }): PlumixCliError {
    return new PlumixCliError(
      "cron_run_tasks_failed",
      `${String(ctx.failed.length)} scheduled task(s) failed on "${ctx.expression}": ${ctx.failed.join(", ")}`,
      "Each failure is logged above with its error. Siblings still ran.",
      undefined,
    );
  }

  /**
   * Distinct from a task failing: nothing ran, so the hint about siblings and
   * per-task logs would send the operator looking for the wrong thing.
   */
  static cronRunNeverStarted(ctx: {
    expression: string;
    reason: string;
  }): PlumixCliError {
    return new PlumixCliError(
      "cron_run_never_started",
      `The run for "${ctx.expression}" failed before any task started: ${ctx.reason}`,
      "Nothing ran. Check the database and the bindings this deploy needs.",
      undefined,
    );
  }

  static cronRunMissingExpression(): PlumixCliError {
    return new PlumixCliError(
      "cron_run_missing_expression",
      "plumix cron run needs the schedule expression to fire",
      'Run `plumix cron list` for the schedules this site declares, then pass one, e.g. `plumix cron run "*/5 * * * *"`.',
      undefined,
    );
  }

  /** An undeclared schedule would otherwise exit green having done nothing. */
  static cronRunUnknownSchedule(ctx: {
    expression: string;
    declared: readonly string[];
  }): PlumixCliError {
    return new PlumixCliError(
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
  }): PlumixCliError {
    const supported = ctx.supported
      .map((n) => `\`plumix ${ctx.command} ${n}\``)
      .join(", ");
    return new PlumixCliError(
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
  }): PlumixCliError {
    return new PlumixCliError(
      "runtime_commands_not_found",
      `Runtime commands module not found: "${ctx.commandsModule}"`,
      `Install the runtime adapter package in ${ctx.cwd}.`,
      ctx.cause,
    );
  }

  static runtimeCommandsLoadFailed(ctx: {
    commandsModule: string;
    cause: unknown;
  }): PlumixCliError {
    return new PlumixCliError(
      "runtime_commands_load_failed",
      `Failed to load runtime commands from "${ctx.commandsModule}"`,
      "Check the runtime adapter's commands module for import errors.",
      ctx.cause,
    );
  }

  static migrateGenerateNoDrizzleKit(): PlumixCliError {
    return new PlumixCliError(
      "migrate_generate_no_drizzle_kit",
      "drizzle-kit could not be resolved",
      "drizzle-kit ships with plumix; rerun `pnpm install` to restore node_modules, or pin a specific version as a devDependency to override.",
      undefined,
    );
  }

  static migrateGenerateFailed(): PlumixCliError {
    return new PlumixCliError(
      "migrate_generate_failed",
      "drizzle-kit generate failed — migrations were not updated",
      "Its output is above. A prompt that needs a TTY means drizzle-kit wants to know whether a column or table was renamed: run `plumix migrate generate` in an interactive terminal to answer it.",
      undefined,
    );
  }

  static metaInvalidArguments(ctx: { cause: unknown }): PlumixCliError {
    return new PlumixCliError(
      "meta_invalid_arguments",
      "plumix meta was given an argument it does not take",
      "Usage: `plumix meta [report | settle] [--binding <name>] [--dry-run] [--yes]`, plus the target options `plumix --help` lists for the runtime.",
      ctx.cause,
    );
  }

  static metaSettleUnconfirmed(): PlumixCliError {
    return new PlumixCliError(
      "meta_settle_unconfirmed",
      "plumix meta settle writes to a deployed database and has no terminal to confirm it in",
      "Nothing was changed. Pass `--dry-run` to see what it would settle, then `--yes` to settle it.",
      undefined,
    );
  }

  static migrateInvalidArguments(ctx: { cause: unknown }): PlumixCliError {
    return new PlumixCliError(
      "migrate_invalid_arguments",
      "plumix migrate was given an argument it does not take",
      "Usage: `plumix migrate [fresh | status | generate] [--binding <name>] [--dry-run] [--yes]`, plus the target options `plumix --help` lists for the runtime.",
      ctx.cause,
    );
  }

  static migrateRuntimeUnsupported(ctx: { runtime: string }): PlumixCliError {
    return new PlumixCliError(
      "migrate_runtime_unsupported",
      `The ${ctx.runtime} runtime does not say how to open its database for migration`,
      "Its commands module exports no `migrations`. Apply each owner's `migrations/` with that database's own tooling.",
      undefined,
    );
  }

  static migrateFreshProduction(): PlumixCliError {
    return new PlumixCliError(
      "migrate_fresh_production",
      "plumix migrate fresh never runs against production",
      "Nothing was touched. To start a production database over, delete and recreate it on the platform.",
      undefined,
    );
  }

  /** Refused after the plan prints and before anything is written. */
  static migrateUnconfirmed(): PlumixCliError {
    return new PlumixCliError(
      "migrate_unconfirmed",
      "plumix migrate writes to a deployed database and has no terminal to confirm it in",
      "Nothing was changed. Pass `--dry-run` to see the plan, then `--yes` to apply it.",
      undefined,
    );
  }

  static migrateFreshUnconfirmed(): PlumixCliError {
    return new PlumixCliError(
      "migrate_fresh_unconfirmed",
      "plumix migrate fresh drops every table and has no terminal to confirm it in",
      "Nothing was dropped. Pass `--dry-run` to see the plan, then `--yes` to drop every table and migrate.",
      undefined,
    );
  }

  static migrateFreshNameMismatch(ctx: { name: string }): PlumixCliError {
    return new PlumixCliError(
      "migrate_fresh_name_mismatch",
      `What was typed is not ${ctx.name}, the database's name`,
      "Nothing was dropped. Run `plumix migrate fresh` again and type the name exactly.",
      undefined,
    );
  }

  static migrateSchemaModuleUnresolved(ctx: {
    spec: string;
    cause: unknown;
  }): PlumixCliError {
    return new PlumixCliError(
      "migrate_schema_module_unresolved",
      `Could not resolve the schemaModule "${ctx.spec}" from this site`,
      "Install the package that provides it, so Plumix can find the migration history it ships.",
      ctx.cause,
    );
  }

  static migrateOwnerHistoryMissing(ctx: {
    packageName: string;
  }): PlumixCliError {
    return new PlumixCliError(
      "migrate_owner_history_missing",
      `${ctx.packageName} declares tables but ships no migrations/ folder`,
      `A package that owns tables must ship its migration history (ADR 0027). Ask the maintainers of ${ctx.packageName} to generate and publish \`migrations/\`. Nothing was applied.`,
      undefined,
    );
  }

  static migrateAdoptionMismatch(ctx: {
    differences: readonly string[];
    ungenerated: readonly string[];
  }): PlumixCliError {
    return new PlumixCliError(
      "migrate_adoption_mismatch",
      `This database was built from a site migration history whose schema differs from what core and the plugins ship:\n${ctx.differences.map((d) => `  - ${d}`).join("\n")}`,
      ctx.ungenerated.length > 0
        ? `Nothing was changed. The site's own schema declares ${ctx.ungenerated.join(", ")}, which its migrations/ has no migration for: run \`plumix migrate generate\`, then \`plumix migrate\` again.`
        : "Nothing was changed. Bring those objects in line with the shipped histories, then run `plumix migrate` again.",
      undefined,
    );
  }

  static migrateSiteDrifted(ctx: { files: readonly string[] }): PlumixCliError {
    return new PlumixCliError(
      "migrate_site_drifted",
      `The site's own tables are ahead of its migrations/: generating would write ${ctx.files.join(", ")}`,
      "Nothing was changed. Run `plumix migrate generate` (or `plumix dev`), commit the migration it writes, then run this again.",
      undefined,
    );
  }

  static migrateDataModuleUnresolved(ctx: {
    spec: string;
    cause: unknown;
  }): PlumixCliError {
    return new PlumixCliError(
      "migrate_data_module_unresolved",
      `Could not resolve the dataMigrations module "${ctx.spec}" from this site`,
      "A plugin's `dataMigrations` resolves like its `schemaModule`; the config's resolves relative to the config file. Nothing was applied.",
      ctx.cause,
    );
  }

  static migrateDataDuplicateName(ctx: {
    owner: string;
    name: string;
  }): PlumixCliError {
    return new PlumixCliError(
      "migrate_data_duplicate_name",
      `${ctx.owner} declares the data migration "${ctx.name}" more than once`,
      "A data migration's name is unique within its owner: it is what the run records. No data migration ran.",
      undefined,
    );
  }

  static migrateDataFailed(ctx: {
    owner: string;
    name: string;
    cause: unknown;
  }): PlumixCliError {
    return new PlumixCliError(
      "migrate_data_failed",
      `${ctx.owner}: the data migration "${ctx.name}" failed: ${ctx.cause instanceof Error ? ctx.cause.message : String(ctx.cause)}`,
      "It was not recorded and nothing after it ran. Fix the cause and run this again: the next run retries it, so its `up` must be safe to run again.",
      ctx.cause,
    );
  }

  static configNotFoundExplicit(ctx: {
    explicit: string;
    absolute: string;
  }): PlumixCliError {
    return new PlumixCliError(
      "config_not_found_explicit",
      `Config file not found: ${ctx.explicit}`,
      `Checked ${ctx.absolute}`,
      undefined,
    );
  }

  static configNotFoundDefault(ctx: { cwd: string }): PlumixCliError {
    return new PlumixCliError(
      "config_not_found_default",
      "No plumix.config.{ts,js,mjs} found",
      `Create plumix.config.ts in ${ctx.cwd} or pass --config <path>.`,
      undefined,
    );
  }

  static configLoadFailed(ctx: {
    configPath: string;
    cause: unknown;
  }): PlumixCliError {
    return new PlumixCliError(
      "config_load_failed",
      `Failed to load ${ctx.configPath}`,
      "Check the file for syntax errors and ensure every import resolves.",
      ctx.cause,
    );
  }

  static configInvalid(ctx: { configPath: string }): PlumixCliError {
    return new PlumixCliError(
      "config_invalid",
      `Invalid config shape in ${ctx.configPath}`,
      "Default export must be the return value of plumix({ ... }) or defineConfig({ ... }).",
      undefined,
    );
  }

  static toolingCommandNoApp(ctx: { command: string }): PlumixCliError {
    return new PlumixCliError(
      "tooling_command_no_app",
      `plumix ${ctx.command}: ctx.app is not available — tooling commands run without a config`,
      "If this command needs the runtime app, dispatch it through the normal config-loading path.",
      undefined,
    );
  }

  static deferredCommandNoApp(ctx: { command: string }): PlumixCliError {
    return new PlumixCliError(
      "deferred_command_no_app",
      `plumix ${ctx.command}: ctx.app is not available — this command builds the app in its own runtime`,
      "Read the config from ctx.configPath instead, or clear `deferApp` if the command must consume the pre-built app.",
      undefined,
    );
  }

  static i18nCheckDrift(ctx: { ids: readonly string[] }): PlumixCliError {
    return new PlumixCliError(
      "i18n_check_drift",
      `Translation catalogs out of sync — ${ctx.ids.length} msgid(s) drifted (+ added, - removed):\n  ${ctx.ids.join("\n  ")}`,
      "Run `plumix i18n extract` locally and commit the updated `.po` file(s).",
      undefined,
    );
  }

  static i18nVerifyDrift(ctx: {
    missingInCatalog: readonly string[];
    orphanedInCatalog: readonly string[];
  }): PlumixCliError {
    const lines: string[] = [];
    for (const id of ctx.missingInCatalog) lines.push(`+ ${id}`);
    for (const id of ctx.orphanedInCatalog) lines.push(`- ${id}`);
    const total = ctx.missingInCatalog.length + ctx.orphanedInCatalog.length;
    return new PlumixCliError(
      "i18n_verify_drift",
      `Source ↔ catalog drift — ${total} msgid(s) (+ missing from catalog, - orphaned in catalog):\n  ${lines.join("\n  ")}`,
      "Add missing entries to `locales/en.po` (translators won't see them otherwise) and drop orphaned ones (dead translation work).",
      undefined,
    );
  }

  static i18nExtractHandAuthored(): PlumixCliError {
    return new PlumixCliError(
      "i18n_extract_hand_authored",
      "This package's catalogs are hand-authored — running `lingui extract` would rewrite `locales/*.po` and demote every existing entry to obsolete.",
      "Edit `locales/en.po` directly and run `plumix i18n verify` to check source ids against the catalog.",
      undefined,
    );
  }

  static i18nCompileFailed(ctx: { reason: string }): PlumixCliError {
    return new PlumixCliError(
      "i18n_compile_failed",
      `Catalog compile failed: ${ctx.reason}`,
      "Lingui's output above names the catalog and message that failed.",
      undefined,
    );
  }

  static i18nInitNoPackageJson(ctx: { cwd: string }): PlumixCliError {
    return new PlumixCliError(
      "i18n_init_no_package_json",
      `No package.json at ${ctx.cwd}`,
      "Run `plumix i18n init` from a package root, or scaffold one first with `pnpm init`.",
      undefined,
    );
  }

  static i18nInitInvalidPackageJson(ctx: {
    cwd: string;
    cause: unknown;
  }): PlumixCliError {
    return new PlumixCliError(
      "i18n_init_invalid_package_json",
      `Cannot parse package.json at ${ctx.cwd}`,
      "Fix the JSON syntax before re-running `plumix i18n init` — refusing to overwrite a malformed file.",
      ctx.cause,
    );
  }

  static portFlagMissingValue(ctx: { flag: string }): PlumixCliError {
    return new PlumixCliError(
      "port_flag_missing_value",
      `${ctx.flag} requires a value`,
      undefined,
      undefined,
    );
  }

  static portFlagOutOfRange(ctx: {
    flag: string;
    raw: string;
  }): PlumixCliError {
    return new PlumixCliError(
      "port_flag_out_of_range",
      `${ctx.flag} value "${ctx.raw}" must be a number between 1 and 65535`,
      undefined,
      undefined,
    );
  }

  /** An empty name would bind every interface, silently. */
  static devHostEmpty(): PlumixCliError {
    return new PlumixCliError(
      "dev_host_empty",
      "plumix dev: --host= requires a value (e.g. --host=0.0.0.0, or --host for every interface)",
      undefined,
      undefined,
    );
  }

  static devEnvironmentNotRunnable(ctx: {
    environment: string;
  }): PlumixCliError {
    return new PlumixCliError(
      "dev_environment_not_runnable",
      `plumix dev: the "${ctx.environment}" environment is not runnable`,
      undefined,
      undefined,
    );
  }

  static syncInvalidArguments(ctx: { cause: unknown }): PlumixCliError {
    return new PlumixCliError(
      "sync_invalid_arguments",
      "plumix sync was given an argument it does not take",
      "Usage: `plumix sync pull|push [--scope <scope>...] [--url <origin>] [--binding <name>] [--dry-run] [--yes] [--no-rewrite-urls]`.",
      ctx.cause,
    );
  }

  /** Refused before anything opens: a push replaces the deployed site's data. */
  static syncPushUnconfirmed(): PlumixCliError {
    return new PlumixCliError(
      "sync_push_unconfirmed",
      "plumix sync push replaces the deployed site's data and has no terminal to confirm it in",
      "Nothing was opened. Pass `--dry-run` to see what it would change, then `--yes` to push.",
      undefined,
    );
  }

  static syncRuntimeUnsupported(ctx: { runtime: string }): PlumixCliError {
    return new PlumixCliError(
      "sync_runtime_unsupported",
      `The ${ctx.runtime} runtime cannot move data between environments yet`,
      "Its commands module exports no `sync`. Nothing was opened.",
      undefined,
    );
  }

  static syncRemoteUrlRequired(): PlumixCliError {
    return new PlumixCliError(
      "sync_remote_url_required",
      "plumix sync needs the deployed site's origin to reach its remote end",
      "Pass `--url <origin>`, such as `--url https://example.com`. Nothing was opened.",
      undefined,
    );
  }

  static syncRemoteTokenMissing(): PlumixCliError {
    return new PlumixCliError(
      "sync_remote_token_missing",
      "plumix sync needs an API token to reach the deployed site and has no terminal to authorize one in",
      "Set `PLUMIX_API_TOKEN` to a token whose user may manage settings, or pass `--token <token>`.",
      undefined,
    );
  }

  /** A dump read back is checked before anything is imported from it. */
  static syncDumpInvalid(ctx: {
    file: string;
    detail: string;
  }): PlumixCliError {
    return new PlumixCliError(
      "sync_dump_invalid",
      `The sync dump is invalid at ${ctx.file}: ${ctx.detail}`,
      "Nothing was imported. A dump is only read by the release that wrote it; run the sync again to write a fresh one.",
      undefined,
    );
  }

  /** The data is already replaced, so only the steps after it are retried. */
  static syncSettleFailed(ctx: {
    failures: readonly { readonly step: string; readonly message: string }[];
  }): PlumixCliError {
    return new PlumixCliError(
      "sync_settle_failed",
      `The data was replaced, but ${String(ctx.failures.length)} step(s) after it failed:\n${ctx.failures.map((f) => `  - ${f.step}: ${f.message}`).join("\n")}`,
      "The replaced data stays. Fix what failed, then run the sync again to repeat these steps.",
      undefined,
    );
  }

  /** Asked for only once the import has run, so it says the data is replaced. */
  static syncSettleTokenMissing(): PlumixCliError {
    return new PlumixCliError(
      "sync_remote_token_missing",
      "The deployed site's settle needs an API token, and there is no terminal to authorize one in",
      "The data was replaced; on a push, the line above says how to restore it. Set `PLUMIX_API_TOKEN` to a token whose user may manage settings, then run the sync again to repeat the steps after it.",
      undefined,
    );
  }

  static syncSettleRefused(ctx: {
    status: number;
    body: string;
  }): PlumixCliError {
    return new PlumixCliError(
      "sync_settle_refused",
      `The deployed site answered ${String(ctx.status)} to the settle after the import`,
      "The data was replaced; on a push, the line above says how to restore it. The token's user needs `settings:manage`, and a scoped token needs that scope; run the sync again to repeat the steps after it.",
      ctx.body,
    );
  }

  static importInvalidArguments(ctx: { cause: unknown }): PlumixCliError {
    return new PlumixCliError(
      "import_invalid_arguments",
      "plumix import was given arguments it does not take",
      "Usage: `plumix import <dir|file.jsonl> [--url <origin>] [--binding <name>] [--dry-run] [--yes] [--no-rewrite-urls]`.",
      ctx.cause,
    );
  }

  /** Refused before anything opens: an import replaces the deployed site's content. */
  static importUnconfirmed(): PlumixCliError {
    return new PlumixCliError(
      "import_unconfirmed",
      "plumix import --url replaces the deployed site's data and has no terminal to confirm it in",
      "Nothing was opened. Pass `--dry-run` to see what it would change, then `--yes` to import.",
      undefined,
    );
  }

  /** Every failing record, so one run reports them all. */
  static importRecordsInvalid(ctx: {
    errors: readonly string[];
  }): PlumixCliError {
    return new PlumixCliError(
      "import_records_invalid",
      `${String(ctx.errors.length)} record(s) cannot be imported:\n${ctx.errors.map((e) => `  - ${e}`).join("\n")}`,
      "Nothing was opened or written. Fix the records, then import again.",
      undefined,
    );
  }

  static mailInvalidArguments(ctx: { cause: unknown }): PlumixCliError {
    return new PlumixCliError(
      "mail_invalid_arguments",
      "plumix mail was given arguments it does not take",
      "Usage: `plumix mail test <to> [--remote --url <origin> [--token <token>]]`.",
      ctx.cause,
    );
  }

  static mailNotConfigured(): PlumixCliError {
    return new PlumixCliError(
      "mail_not_configured",
      "The site has no mailer to send the test mail through",
      "Set one with `plumix({ mailer })` in plumix.config.ts. `consoleMailer()` prints each mail to the terminal.",
      undefined,
    );
  }

  /** The transport's own words, so the operator reads what it refused. */
  static mailSendFailed(ctx: { message: string }): PlumixCliError {
    return new PlumixCliError(
      "mail_send_failed",
      ctx.message,
      "The site's mailer refused the test mail. Check the credentials and settings its transport reads.",
      undefined,
    );
  }

  static mailSiteUnreachable(ctx: {
    detail: string;
    cause: unknown;
  }): PlumixCliError {
    return new PlumixCliError(
      "mail_site_unreachable",
      `Could not reach the site's database from here: ${ctx.detail}`,
      "Run `plumix migrate` first if the database is new.",
      ctx.cause,
    );
  }

  static mailRemoteUrlRequired(): PlumixCliError {
    return new PlumixCliError(
      "mail_remote_url_required",
      "plumix mail test --remote needs the deployed site's origin",
      "Pass `--url <origin>`, such as `--url https://example.com`. Nothing was sent.",
      undefined,
    );
  }

  static mailRemoteTokenMissing(): PlumixCliError {
    return new PlumixCliError(
      "mail_remote_token_missing",
      "plumix mail test --remote needs an API token and has no terminal to authorize one in",
      "Set `PLUMIX_API_TOKEN` to a token whose user may manage settings, or pass `--token <token>`. Nothing was sent.",
      undefined,
    );
  }

  static mailRemoteRefused(ctx: {
    status: number;
    body: string;
  }): PlumixCliError {
    return new PlumixCliError(
      "mail_remote_refused",
      `The deployed site answered ${String(ctx.status)} and sent no mail`,
      "The token's user needs `settings:manage`, a scoped token needs that scope, and the site must serve its REST API (`api: { enabled: true }`).",
      ctx.body,
    );
  }

  static deviceAuthorizationFailed(ctx: { detail: string }): PlumixCliError {
    return new PlumixCliError(
      "device_authorization_failed",
      `The site did not authorize this command: ${ctx.detail}`,
      "Run the command again for a new code, or set `PLUMIX_API_TOKEN` to an API token.",
      undefined,
    );
  }
}
