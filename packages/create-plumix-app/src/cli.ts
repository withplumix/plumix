import type { RuntimeDescriptor } from "./compose/types.js";
import type { PackageManager } from "./package-manager.js";
import type { CommandRunner } from "./post-scaffold.js";
import type { CliIO, Reporter } from "./reporter.js";
import type { ScaffoldSources } from "./sources.js";
import type { WizardSelection } from "./wizard.js";
import { ScaffoldError } from "./errors.js";
import {
  detectPackageManager,
  isKnownPackageManager,
  PACKAGE_MANAGERS,
} from "./package-manager.js";
import { nextSteps, runPostScaffold, spawnRunner } from "./post-scaffold.js";
import { reconcile } from "./reconcile.js";
import { recommendedPluginIds } from "./registry.js";
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
                       Defaults to the recommended set; --plugins= for none.
  --auth <ids>         Comma-separated auth methods added to passkey
                       (oauth, magic-link; cfAccess on cloudflare).
  --pm <name>          Package manager (npm, pnpm, yarn, bun); auto-detected.
  --no-install         Skip installing dependencies.
  --no-db              Skip applying migrations to the local database.
  --no-git             Skip initializing a git repository.
  -y, --yes            Accept defaults for anything not specified.

Example:
  pnpm create plumix-app my-site --plugins pages,media
  cd my-site
  pnpm dev`;

/**
 * Only drive the interactive wizard on a real terminal (and never in CI),
 * so piped/scripted invocations stay on the deterministic flag path.
 */
function isInteractive(): boolean {
  return process.stdin.isTTY && process.stdout.isTTY && !process.env.CI;
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
  const requestedPm: PackageManager | undefined =
    reconciled.pm !== undefined && isKnownPackageManager(reconciled.pm)
      ? reconciled.pm
      : undefined;

  const interactive = reconciled.prompts.length > 0 && isInteractive();
  const reporter: Reporter = interactive ? clackReporter : plainReporter(io);
  // Ahead of the registry load, so a load failure cancels inside the session.
  if (interactive) reporter.intro();

  // Both paths need the registry up front: it names the plugins an unflagged
  // run takes.
  let sources: ScaffoldSources;
  try {
    sources = await loadScaffoldSources();
  } catch (error) {
    reporter.cancelled(messageOf(error));
    return 1;
  }

  let selection: WizardSelection = {
    targetDir: reconciled.targetDir,
    runtimeId: reconciled.runtimeId,
    // Doubles as the wizard's preticked set when the plugins prompt runs.
    pluginIds: reconciled.pluginIds ?? recommendedPluginIds(sources.registry),
    authMethodIds: reconciled.authMethodIds ?? [],
  };

  if (interactive) {
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
    const runtime = sources.registry.runtimes.find((r) => r.id === runtimeId);
    const pm = resolvePackageManager(runtime, requestedPm, deps.userAgent);
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
      cli: runtime?.cli,
    });
    const steps = nextSteps(pm, result.name, { installed: post.installed });

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
    reporter.cancelled(messageOf(error));
    return 1;
  }
}

/**
 * pnpm's `.bin` shims can't run under `bun --bun`, so a runtime pinning a
 * package manager refuses an explicit `--pm` naming another.
 */
function resolvePackageManager(
  runtime: RuntimeDescriptor | undefined,
  requested: PackageManager | undefined,
  userAgent: string | undefined,
): PackageManager {
  const pinned = runtime?.packageManager;
  if (pinned && requested !== undefined && requested !== pinned) {
    throw ScaffoldError.packageManagerConflict({
      runtime: runtime.id,
      packageManager: pinned,
      requested,
    });
  }
  return pinned ?? requested ?? detectPackageManager(userAgent);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
