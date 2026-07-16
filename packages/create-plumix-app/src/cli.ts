import { createRequire } from "node:module";

import { reconcile } from "./reconcile.js";
import { DEFAULT_RUNTIME, scaffold } from "./scaffold.js";

export interface CliIO {
  stdout(line: string): void;
  stderr(line: string): void;
}

// The plumix wordmark, shown once as a welcome header on a successful scaffold.
export const BANNER = [
  "        _                 _",
  "  _ __ | |_   _ _ __ ___ (_)_  __",
  " | '_ \\| | | | | '_ ` _ \\| \\ \\/ /",
  " | |_) | | |_| | | | | | | |>  <",
  " | .__/|_|\\__,_|_| |_| |_|_/_/\\_\\",
  " |_|",
].join("\n");

// Resolved from this package's own manifest at runtime — never hardcoded.
function readVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const USAGE = `Usage: create-plumix-app <target-directory> [options]

Scaffold a new Plumix project into <target-directory>. The directory must
not exist (or must be empty); its parent must exist.

Options:
  --runtime <id>       Runtime to target (default: ${DEFAULT_RUNTIME}).
  -p, --plugins <ids>  Comma-separated plugins to include (e.g. pages,comments).
  -y, --yes            Accept defaults for anything not specified.

Example:
  pnpm create plumix-app my-site --plugins pages,media
  cd my-site
  pnpm install
  pnpm dev`;

export async function runCli(
  argv: readonly string[],
  io: CliIO,
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(USAGE);
    return 0;
  }

  const { targetDir, runtimeId, pluginIds } = reconcile(argv);
  if (targetDir === undefined) {
    io.stderr(USAGE);
    return 1;
  }

  try {
    const result = await scaffold({ targetDir, runtimeId, pluginIds });
    io.stdout(BANNER);
    io.stdout(`v${readVersion()}`);
    io.stdout("");
    io.stdout(`Created ${result.name} at ${result.targetDir}.`);
    io.stdout("");
    io.stdout("Next steps:");
    io.stdout(`  cd ${result.name}`);
    io.stdout("  pnpm install");
    io.stdout("  pnpm dev");
    return 0;
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 1;
  }
}
