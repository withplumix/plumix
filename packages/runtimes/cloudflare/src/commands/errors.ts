import { CliError } from "plumix/cli";

type CloudflareCliErrorCode =
  | "migrate_no_wrangler_config"
  | "migrate_no_d1"
  | "migrate_ambiguous_binding"
  | "migrate_unknown_binding";

// D1 and wrangler vocabulary, which core's runtime-agnostic `CliError` does
// not carry.
export class CloudflareCliError extends CliError<CloudflareCliErrorCode> {
  static migrateNoWranglerConfig(ctx: { cwd: string }): CloudflareCliError {
    return new CloudflareCliError(
      "migrate_no_wrangler_config",
      `No wrangler.jsonc, wrangler.json or wrangler.toml in ${ctx.cwd}`,
      "Run `plumix migrate` from the project root, where the wrangler config with the site's `d1_databases` lives.",
      undefined,
    );
  }

  static migrateNoD1(ctx: { filename: string }): CloudflareCliError {
    return new CloudflareCliError(
      "migrate_no_d1",
      `No d1_databases entry with a binding in ${ctx.filename}`,
      "Add the site's D1 database to `d1_databases`, with the `binding` the config's `d1()` names.",
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
}
