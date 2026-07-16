import { createRequire } from "node:module";
import * as clack from "@clack/prompts";

import type { PackageManager } from "./package-manager.js";
import type { CommandRunner } from "./post-scaffold.js";
import type { ScaffoldSources } from "./sources.js";
import type { WizardSelection } from "./wizard.js";
import {
  detectPackageManager,
  isKnownPackageManager,
  PACKAGE_MANAGERS,
} from "./package-manager.js";
import { nextSteps, runPostScaffold, spawnRunner } from "./post-scaffold.js";
import { reconcile } from "./reconcile.js";
import { DEFAULT_RUNTIME, loadScaffoldSources, scaffold } from "./scaffold.js";
import { clackPrompter, runWizard } from "./wizard.js";

export interface CliIO {
  stdout(line: string): void;
  stderr(line: string): void;
}

export interface CliDeps {
  /** Command runner for install/git — injected in tests to avoid spawning. */
  readonly runner?: CommandRunner;
  /** `npm_config_user_agent`, for package-manager detection. */
  readonly userAgent?: string;
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
  --pm <name>          Package manager (npm, pnpm, yarn, bun); auto-detected.
  --no-install         Skip installing dependencies.
  --no-db              Skip generating and applying local migrations.
  --no-git             Skip initializing a git repository.
  -y, --yes            Accept defaults for anything not specified.

Example:
  pnpm create plumix-app my-site --plugins pages,media
  cd my-site
  pnpm dev`;

// Only drive the interactive wizard on a real terminal (and never in CI),
// so piped/scripted invocations stay on the deterministic flag path.
function isInteractive(): boolean {
  return (
    Boolean(process.stdin.isTTY && process.stdout.isTTY) && !process.env.CI
  );
}

export async function runCli(
  argv: readonly string[],
  io: CliIO,
  deps: CliDeps = {},
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    io.stdout(USAGE);
    return 0;
  }

  const runner = deps.runner ?? spawnRunner;
  const reconciled = reconcile(argv);

  // An explicit --pm must name a manager we support (mirrors --runtime),
  // rather than silently falling back to npm.
  if (reconciled.pm !== undefined && !isKnownPackageManager(reconciled.pm)) {
    io.stderr(
      `Unknown package manager "${reconciled.pm}". Use one of: ${PACKAGE_MANAGERS.join(", ")}.`,
    );
    return 1;
  }
  const pm: PackageManager =
    reconciled.pm !== undefined && isKnownPackageManager(reconciled.pm)
      ? reconciled.pm
      : detectPackageManager(deps.userAgent);

  let selection: WizardSelection = {
    targetDir: reconciled.targetDir,
    runtimeId: reconciled.runtimeId,
    pluginIds: reconciled.pluginIds,
    authMethodIds: [],
  };

  const interactive = reconciled.prompts.length > 0 && isInteractive();
  let sources: ScaffoldSources | undefined;
  if (interactive) {
    sources = await loadScaffoldSources();
    clack.intro("create-plumix-app");
    const filled = await runWizard(
      reconciled.prompts,
      selection,
      sources.registry,
      clackPrompter,
    );
    if (filled === null) {
      clack.cancel("Scaffolding cancelled.");
      return 1;
    }
    selection = filled;
  }

  const { targetDir, runtimeId, pluginIds, authMethodIds } = selection;
  if (targetDir === undefined) {
    io.stderr(USAGE);
    return 1;
  }

  try {
    const result = await scaffold({
      targetDir,
      runtimeId,
      pluginIds,
      authMethodIds,
      sources,
    });

    const post = await runPostScaffold({
      targetDir,
      pm,
      install: reconciled.install,
      db: reconciled.db,
      git: reconciled.git,
      runner,
    });
    const steps = nextSteps(pm, result.name, {
      installed: post.installed,
      dbReady: post.dbSetup,
    });

    if (interactive) {
      if (post.installFailed) clack.log.warn(`"${pm} install" failed.`);
      if (post.dbSetupFailed) clack.log.warn("Local database setup failed.");
      clack.outro(`Created ${result.name}. Next: ${steps.join(" && ")}`);
    } else {
      io.stdout(BANNER);
      io.stdout(`v${readVersion()}`);
      io.stdout("");
      io.stdout(`Created ${result.name} at ${result.targetDir}.`);
      if (post.installFailed) io.stdout("Dependency install failed.");
      if (post.dbSetupFailed) io.stdout("Local database setup failed.");
      io.stdout("");
      io.stdout("Next steps:");
      for (const step of steps) io.stdout(`  ${step}`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (interactive) clack.cancel(message);
    else io.stderr(message);
    return 1;
  }
}
