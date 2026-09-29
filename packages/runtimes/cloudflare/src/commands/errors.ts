import { CliError } from "plumix/cli";

type CloudflareCliErrorCode =
  | "migrate_apply_missing_db"
  | "migrate_apply_no_d1"
  | "migrate_apply_ambiguous_db";

// D1 and wrangler vocabulary, which core's runtime-agnostic `CliError` does
// not carry.
export class CloudflareCliError extends CliError<CloudflareCliErrorCode> {
  static migrateApplyMissingDb(): CloudflareCliError {
    return new CloudflareCliError(
      "migrate_apply_missing_db",
      "Missing D1 database name",
      "Pass the database name: `plumix migrate apply <database-name>`. Or add a wrangler.jsonc / wrangler.toml with a `d1_databases` entry so Plumix can auto-discover it.",
      undefined,
    );
  }

  static migrateApplyNoD1(ctx: { filename: string }): CloudflareCliError {
    return new CloudflareCliError(
      "migrate_apply_no_d1",
      `No d1_databases entries with a database_name in ${ctx.filename}`,
      "Add a `d1_databases` entry with a `database_name`, or pass the name explicitly: `plumix migrate apply <database-name>`.",
      undefined,
    );
  }

  static migrateApplyAmbiguousDb(ctx: {
    filename: string;
    names: readonly string[];
  }): CloudflareCliError {
    return new CloudflareCliError(
      "migrate_apply_ambiguous_db",
      `Multiple D1 databases found in ${ctx.filename}: ${ctx.names.join(", ")}`,
      "Pass the name explicitly: `plumix migrate apply <database-name>`.",
      undefined,
    );
  }
}
