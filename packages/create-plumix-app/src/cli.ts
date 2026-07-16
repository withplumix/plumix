import { createRequire } from "node:module";

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

Example:
  pnpm create plumix-app my-site --plugins pages,media
  cd my-site
  pnpm install
  pnpm dev`;

// Parses the target dir, `--runtime`, and `-p/--plugins` (comma-separated,
// each accepting a `--flag value` or `--flag=value` form).
function parseArgs(argv: readonly string[]): {
  target: string | undefined;
  runtime: string;
  plugins: string[];
} {
  let runtime = DEFAULT_RUNTIME;
  const plugins: string[] = [];
  const positional: string[] = [];
  const addPlugins = (csv: string): void => {
    for (const id of csv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      plugins.push(id);
    }
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--runtime") {
      runtime = argv[i + 1] ?? "";
      i++;
    } else if (arg.startsWith("--runtime=")) {
      runtime = arg.slice("--runtime=".length);
    } else if (arg === "--plugins" || arg === "-p") {
      addPlugins(argv[i + 1] ?? "");
      i++;
    } else if (arg.startsWith("--plugins=")) {
      addPlugins(arg.slice("--plugins=".length));
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }
  return { target: positional[0], runtime, plugins };
}

export async function runCli(
  argv: readonly string[],
  io: CliIO,
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(USAGE);
    return 0;
  }

  const { target, runtime, plugins } = parseArgs(argv);
  if (target === undefined) {
    io.stderr(USAGE);
    return 1;
  }

  try {
    const result = await scaffold({
      targetDir: target,
      runtimeId: runtime,
      pluginIds: plugins,
    });
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
