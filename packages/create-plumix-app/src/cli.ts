import type { PackageManager } from "./package-manager.js";
import type { CommandRunner } from "./post-scaffold.js";
import type { CliIO, Reporter } from "./reporter.js";
import type { ScaffoldSources } from "./sources.js";
import type { WizardSelection } from "./wizard.js";
import {
  detectPackageManager,
  isKnownPackageManager,
  PACKAGE_MANAGERS,
} from "./package-manager.js";
import { nextSteps, runPostScaffold, spawnRunner } from "./post-scaffold.js";
import { reconcile } from "./reconcile.js";
import { clackReporter, plainReporter } from "./reporter.js";
import { DEFAULT_RUNTIME, loadScaffoldSources, scaffold } from "./scaffold.js";
import { clackPrompter, runWizard } from "./wizard.js";

export interface CliDeps {
  /** Command runner for install/git — injected in tests to avoid spawning. */
  readonly runner?: CommandRunner;
  /** `npm_config_user_agent`, for package-manager detection. */
  readonly userAgent?: string;
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

  if (argv.some((a) => a === "--template" || a.startsWith("--template="))) {
    io.stderr(
      "The --template flag was removed. Use -p/--plugins to choose plugins (e.g. -p blog,pages).",
    );
    return 1;
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
  const reporter: Reporter = interactive ? clackReporter : plainReporter(io);
  let sources: ScaffoldSources | undefined;
  if (interactive) {
    sources = await loadScaffoldSources();
    reporter.intro();
    const filled = await runWizard(
      reconciled.prompts,
      selection,
      sources.registry,
      clackPrompter,
    );
    if (filled === null) {
      reporter.cancelled("Scaffolding cancelled.");
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

    reporter.created({
      name: result.name,
      targetDir: result.targetDir,
      steps,
      pm,
      installFailed: post.installFailed,
      dbSetupFailed: post.dbSetupFailed,
    });
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reporter.cancelled(message);
    return 1;
  }
}
