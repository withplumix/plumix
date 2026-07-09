import { createRequire } from "node:module";

import { availableTemplates, DEFAULT_TEMPLATE, scaffold } from "./scaffold.js";

export interface CliIO {
  stdout(line: string): void;
  stderr(line: string): void;
}

// The plumix wordmark, shown once as a welcome header on a successful scaffold
// (the CLI's running commands use a compact version badge instead). Kept inline
// as a plain string so it flows through the injected `CliIO` unchanged and this
// package stays dependency-free — it runs via `npm create` before install.
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

// Built lazily so reading the available templates from disk happens
// when usage is shown, not as an import-time side effect.
function usage(): string {
  return `Usage: create-plumix-app <target-directory> [--template <name>]

Scaffold a new Plumix project into <target-directory>. The directory
must not exist (or must be empty); its parent must exist.

Options:
  --template <name>  Template to scaffold (default: ${DEFAULT_TEMPLATE}).
                     Available: ${availableTemplates().join(", ")}.

Example:
  pnpm create plumix-app my-blog --template blog
  cd my-blog
  pnpm install
  pnpm dev`;
}

// Pulls the target dir and `--template <name>` / `--template=<name>`
// out of argv, defaulting to the minimal template. Consuming the flag's
// value keeps it out of the positional args.
function parseArgs(argv: readonly string[]): {
  target: string | undefined;
  template: string;
} {
  let template = DEFAULT_TEMPLATE;
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;
    if (arg === "--template") {
      template = argv[i + 1] ?? "";
      i++;
    } else if (arg.startsWith("--template=")) {
      template = arg.slice("--template=".length);
    } else if (!arg.startsWith("-")) {
      positional.push(arg);
    }
  }
  return { target: positional[0], template };
}

export async function runCli(
  argv: readonly string[],
  io: CliIO,
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(usage());
    return 0;
  }

  const { target, template } = parseArgs(argv);
  if (target === undefined) {
    io.stderr(usage());
    return 1;
  }

  try {
    const result = await scaffold({ targetDir: target, template });
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
