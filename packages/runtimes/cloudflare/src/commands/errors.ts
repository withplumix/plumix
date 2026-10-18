import { CliError } from "plumix/cli";

type CloudflareCliErrorCode =
  | "migrate_no_wrangler_config"
  | "migrate_no_d1"
  | "migrate_ambiguous_binding"
  | "migrate_unknown_binding"
  | "migrate_target_conflict"
  | "deploy_env_conflict"
  | "sync_remote_target_missing"
  | "sync_no_storage"
  | "sync_author_missing"
  | "sync_site_cannot_run"
  | "sync_site_unreachable";

/** What to add to a wrangler config block that binds no D1 database. */
export function addD1Hint(ctx: {
  filename: string;
  block: string;
  binding: string;
}): string {
  return `Add to ${ctx.block} in ${ctx.filename}: "d1_databases": [{ "binding": "${ctx.binding}", "database_name": "<name>", "database_id": "<id>" }], with the id \`wrangler d1 create <name>\` prints.`;
}

/**
 * D1 and wrangler vocabulary, which core's runtime-agnostic `CliError` does
 * not carry.
 */
export class CloudflareCliError extends CliError<CloudflareCliErrorCode> {
  static migrateNoWranglerConfig(ctx: { cwd: string }): CloudflareCliError {
    return new CloudflareCliError(
      "migrate_no_wrangler_config",
      `No wrangler.jsonc, wrangler.json or wrangler.toml in ${ctx.cwd}`,
      "Run `plumix migrate` from the project root, where the wrangler config with the site's `d1_databases` lives.",
      undefined,
    );
  }

  static migrateNoD1(ctx: {
    filename: string;
    block: string;
    binding: string;
  }): CloudflareCliError {
    return new CloudflareCliError(
      "migrate_no_d1",
      `${ctx.block} in ${ctx.filename} binds no D1 database as "${ctx.binding}"`,
      addD1Hint(ctx),
      undefined,
    );
  }

  static migrateTargetConflict(ctx: { env: string }): CloudflareCliError {
    return new CloudflareCliError(
      "migrate_target_conflict",
      `--production and --env ${ctx.env} name two environments`,
      "Pass one: `--production` for production, `--env <name>` for another environment.",
      undefined,
    );
  }

  static deployEnvConflict(ctx: {
    flag: string;
    ambient: string;
  }): CloudflareCliError {
    return new CloudflareCliError(
      "deploy_env_conflict",
      `--env ${ctx.flag} names another environment than CLOUDFLARE_ENV, ${ctx.ambient}`,
      "Nothing was built. Unset CLOUDFLARE_ENV, or pass the --env it names.",
      undefined,
    );
  }

  static migrateAmbiguousBinding(ctx: {
    filename: string;
    bindings: readonly string[];
  }): CloudflareCliError {
    return new CloudflareCliError(
      "migrate_ambiguous_binding",
      `${ctx.filename} declares several D1 bindings: ${ctx.bindings.join(", ")}`,
      "Name the one to migrate: `plumix migrate --binding <name>`.",
      undefined,
    );
  }

  static migrateUnknownBinding(ctx: {
    filename: string;
    binding: string;
    bindings: readonly string[];
  }): CloudflareCliError {
    return new CloudflareCliError(
      "migrate_unknown_binding",
      `${ctx.filename} declares no D1 binding "${ctx.binding}"`,
      `The D1 bindings it declares: ${ctx.bindings.join(", ") || "none"}.`,
      undefined,
    );
  }

  static syncRemoteTargetMissing(): CloudflareCliError {
    return new CloudflareCliError(
      "sync_remote_target_missing",
      "A sync's deployed end needs the database it reaches named",
      "Nothing was changed. Pass `--production`, `--preview` or `--env <name>`, as `plumix migrate` takes them.",
      undefined,
    );
  }

  static syncNoStorage(): CloudflareCliError {
    return new CloudflareCliError(
      "sync_no_storage",
      "The media scope moves the storage slot's objects, and the site configures no storage",
      'Add `storage: r2({ binding: "MEDIA" })` to plumix.config.ts, or sync without `--scope media`.',
      undefined,
    );
  }

  /** A dump's row names a user its authors do not list. */
  static syncAuthorMissing(ctx: {
    table: string;
    column: string;
    user: string;
  }): CloudflareCliError {
    return new CloudflareCliError(
      "sync_author_missing",
      `${ctx.table}.${ctx.column} references user ${ctx.user}, who is not among the dump's authors`,
      "Nothing was changed. Export the dump again; one written by `plumix sync` lists every user its rows reference.",
      undefined,
    );
  }

  static syncSiteCannotRun(): CloudflareCliError {
    return new CloudflareCliError(
      "sync_site_cannot_run",
      "The data was replaced, but the site's handler can't run the settle outside a request",
      "The site's runtime handler drops `run`; settle the deployed site with `plumix sync` against it, or restore `run` in its `handler.wrap`.",
      undefined,
    );
  }

  static syncSiteUnreachable(ctx: {
    detail: string;
    cause: unknown;
  }): CloudflareCliError {
    return new CloudflareCliError(
      "sync_site_unreachable",
      `The data was replaced, but the site could not reach its bindings from the command line to settle: ${ctx.detail}`,
      "Check that the wrangler config binds every binding plumix.config.ts names, then sync again to repeat the steps after the import.",
      ctx.cause,
    );
  }
}
