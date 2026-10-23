import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  CommandDefinition,
  CommandRegistry,
  PlumixApp,
  PlumixConfig,
  RuntimeAdapter,
  RuntimeDiagnose,
  RuntimeMigrations,
  RuntimeSync,
} from "@plumix/core";
import { isCliError } from "@plumix/core/cli";
import { loadOnce } from "@plumix/core/support";

import type { CommandGroup, TargetOptionGroup } from "./help.js";
import type { LoadedConfig } from "./load-config.js";
import { cronCommand } from "./commands/cron.js";
import { doctorCommand } from "./commands/doctor.js";
import { i18nCommand } from "./commands/i18n.js";
import { importCommand } from "./commands/import.js";
import { mailCommand } from "./commands/mail.js";
import { metaCommand } from "./commands/meta.js";
import { migrateCommand, migrateForDev } from "./commands/migrate.js";
import { syncCommand } from "./commands/sync.js";
import { PlumixCliError } from "./errors.js";
import { formatCommandHelp, formatHelp } from "./help.js";
import { loadConfig } from "./load-config.js";
import { badge, exitWithError, report } from "./report.js";

/**
 * Deferred: core's root barrel costs ~500ms to evaluate, and `dev`,
 * `--version`, `--help` and `i18n` never need it.
 */
const loadCore = loadOnce(() => import("@plumix/core"));

/**
 * A built-in may read the whole app — `meta` and `cron` build the site's
 * handler from it; a runtime's own commands see only its `CommandApp` part.
 */
const BUILT_IN_COMMANDS: ReadonlyMap<
  string,
  CommandDefinition<PlumixApp>
> = new Map<string, CommandDefinition<PlumixApp>>([
  ["migrate", migrateCommand],
  ["cron", cronCommand],
  ["meta", metaCommand],
  ["mail", mailCommand],
  ["doctor", doctorCommand],
  ["i18n", i18nCommand],
  ["sync", syncCommand],
  ["import", importCommand],
]);

interface CliArgs {
  readonly command: string | undefined;
  readonly rest: readonly string[];
  readonly config: string | undefined;
  readonly cwd: string;
  readonly help: boolean;
  readonly version: boolean;
  readonly verbose: boolean;
}

function parseCli(argv: readonly string[]): CliArgs {
  // Every token after the command name passes through unparsed so subcommand
  // flags like `--production` survive.
  let cwd = process.cwd();
  let config: string | undefined;
  let help = false;
  let version = false;
  let verbose = false;

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (token === undefined) break;
    if (token === "--help" || token === "-h") {
      help = true;
      i += 1;
      continue;
    }
    if (token === "--version" || token === "-v") {
      version = true;
      i += 1;
      continue;
    }
    if (token === "--verbose") {
      verbose = true;
      i += 1;
      continue;
    }
    if (token === "--cwd") {
      cwd = argv[i + 1] ?? cwd;
      i += 2;
      continue;
    }
    if (token === "--config") {
      config = argv[i + 1];
      i += 2;
      continue;
    }
    if (token.startsWith("--cwd=")) {
      cwd = token.slice("--cwd=".length);
      i += 1;
      continue;
    }
    if (token.startsWith("--config=")) {
      config = token.slice("--config=".length);
      i += 1;
      continue;
    }
    // First non-plumix token: command name (or, if it's a flag,
    // subcommand-only).
    break;
  }

  return {
    command: argv[i],
    rest: argv.slice(i + 1),
    config,
    cwd: resolve(cwd),
    help,
    version,
    verbose,
  };
}

export async function run(argv: readonly string[]): Promise<void> {
  const args = parseCli(argv);
  if (args.verbose) process.env.PLUMIX_VERBOSE = "1";
  // The config evaluates here before Vite's `define` exists, and `plumix()`
  // reads the flag: a dev site may leave out the mailer, since dev catches
  // its mail.
  if (args.command === "dev") process.env.PLUMIX_DEV = "1";

  if (args.version) {
    report.info(readVersion());
    return;
  }

  if (args.command === undefined || args.command === "help" || args.help) {
    await printHelp(args);
    return;
  }

  // Anywhere after the command name, so `plumix deploy --env qa --help` prints
  // help rather than building and migrating.
  if (args.rest.some((token) => token === "--help" || token === "-h")) {
    await printCommandHelp(args, args.command);
    return;
  }

  // Gated on a TTY so piped and CI runs stay clean.
  if (
    (args.command === "dev" || args.command === "build") &&
    process.stderr.isTTY
  ) {
    badge(readVersion());
  }

  // `i18n` is tooling — runs from any package directory (admin, plugins,
  // themes) regardless of whether the cwd is a plumix consumer project.
  // No `plumix.config.ts` means no app + no runtime; dispatch directly.
  if (args.command === "i18n") {
    const command = BUILT_IN_COMMANDS.get("i18n");
    if (!command)
      throw PlumixCliError.unknownCommand({ command: args.command });
    await command.run({
      app: appSentinel(() =>
        PlumixCliError.toolingCommandNoApp({ command: "i18n" }),
      ),
      cwd: args.cwd,
      configPath: "",
      argv: args.rest,
    });
    return;
  }

  const loaded = await loadConfig(args.cwd, args.config);
  const runtimeModule = await loadRuntimeCommands(
    loaded.config.runtime,
    args.cwd,
  );
  const command = resolveCommand(runtimeModule.commands, args.command);
  if (!command) {
    throw PlumixCliError.unknownCommand({ command: args.command });
  }

  await runCommand(args.command, command, {
    cwd: args.cwd,
    argv: args.rest,
    loaded,
    runtimeMigrations: runtimeModule.migrations,
    runtimeDiagnose: runtimeModule.diagnose,
    runtimeSync: runtimeModule.sync,
  });
}

interface RunCommandInput {
  readonly cwd: string;
  readonly argv: readonly string[];
  readonly loaded: LoadedConfig;
  readonly runtimeMigrations: RuntimeMigrations | undefined;
  readonly runtimeDiagnose: RuntimeDiagnose | undefined;
  readonly runtimeSync: RuntimeSync | undefined;
}

/** Runs a resolved command; `dev` migrates the local database first. */
export async function runCommand(
  name: string,
  command: CommandDefinition<PlumixApp>,
  {
    cwd,
    argv,
    loaded,
    runtimeMigrations,
    runtimeDiagnose,
    runtimeSync,
  }: RunCommandInput,
): Promise<void> {
  // Before the command opens anything: on Cloudflare the dev server reads the
  // same local state the migration proxy holds until it closes.
  if (name === "dev") {
    await migrateForDev({
      cwd,
      configPath: loaded.configPath,
      config: loaded.config,
      runtimeMigrations,
    });
  }
  const app = await resolveCommandApp(command, loaded.config, name);
  await command.run({
    app,
    cwd,
    configPath: loaded.configPath,
    argv,
    runtimeMigrations,
    runtimeDiagnose,
    runtimeSync,
  });
}

/**
 * The app the command runs against: the eagerly built app, or — when the
 * command opts out via {@link CommandDefinition.deferApp} — a throwing
 * sentinel.
 */
export async function resolveCommandApp(
  command: CommandDefinition,
  config: PlumixConfig,
  commandName: string,
): Promise<PlumixApp> {
  if (command.deferApp) {
    return appSentinel(() =>
      PlumixCliError.deferredCommandNoApp({ command: commandName }),
    );
  }
  const { buildApp } = await loadCore();
  return buildApp(config);
}

/**
 * Throws on any property read so code reaching for `ctx.app` fails loud. `then`
 * is exempt so the sentinel survives `await`.
 */
function appSentinel(makeError: () => PlumixCliError): PlumixApp {
  return new Proxy(
    {},
    {
      get(_target, prop): unknown {
        if (prop === "then") return undefined;
        throw makeError();
      },
    },
  ) as never;
}

interface HelpContext {
  readonly loaded: LoadedConfig | undefined;
  readonly runtimeModule: RuntimeCommandsModule;
}

async function loadHelpContext(args: CliArgs): Promise<HelpContext> {
  let loaded: LoadedConfig | undefined;
  let runtimeModule: RuntimeCommandsModule = {
    commands: {},
    migrations: undefined,
    diagnose: undefined,
    sync: undefined,
  };
  try {
    loaded = await loadConfig(args.cwd, args.config);
    runtimeModule = await loadRuntimeCommands(loaded.config.runtime, args.cwd);
  } catch (error) {
    // Help is still useful with no config loaded; surface the reason in
    // verbose.
    report.verbose(
      `help: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return { loaded, runtimeModule };
}

async function printCommandHelp(args: CliArgs, name: string): Promise<void> {
  const { loaded, runtimeModule } = await loadHelpContext(args);
  const command = resolveCommand(runtimeModule.commands, name);
  if (!command) throw PlumixCliError.unknownCommand({ command: name });
  report.info(
    formatCommandHelp(
      name,
      command,
      loaded && targetOptionGroup(loaded, runtimeModule),
    ),
  );
}

async function printHelp(args: CliArgs): Promise<void> {
  const { loaded, runtimeModule } = await loadHelpContext(args);
  report.info(
    formatHelp(
      buildGroups(loaded, runtimeModule.commands),
      loaded && targetOptionGroup(loaded, runtimeModule),
    ),
  );
}

function targetOptionGroup(
  loaded: LoadedConfig,
  runtimeModule: RuntimeCommandsModule,
): TargetOptionGroup {
  const takers = [
    ...(runtimeModule.migrations?.targetOptions ? ["migrate", "meta"] : []),
    ...(runtimeModule.sync?.targetOptions ? ["sync", "import"] : []),
  ];
  return {
    label: `${loaded.config.runtime.name} runtime target options (${takers.join(", ")})`,
    options: {
      ...runtimeModule.migrations?.targetOptions,
      ...runtimeModule.sync?.targetOptions,
    },
  };
}

function buildGroups(
  loaded: LoadedConfig | undefined,
  runtimeCommands: CommandRegistry,
): readonly CommandGroup[] {
  const groups: CommandGroup[] = [
    { label: "Built-in", commands: BUILT_IN_COMMANDS },
  ];
  if (loaded) {
    const runtime = new Map<string, CommandDefinition>(
      Object.entries(runtimeCommands),
    );
    if (runtime.size > 0) {
      groups.push({
        label: `${loaded.config.runtime.name} runtime`,
        commands: runtime,
      });
    }
  }
  return groups;
}

interface RuntimeCommandsModule {
  readonly commands: CommandRegistry;
  readonly migrations: RuntimeMigrations | undefined;
  readonly diagnose: RuntimeDiagnose | undefined;
  readonly sync: RuntimeSync | undefined;
}

async function loadRuntimeCommands(
  adapter: RuntimeAdapter,
  cwd: string,
): Promise<RuntimeCommandsModule> {
  if (!adapter.commandsModule) {
    return {
      commands: {},
      migrations: undefined,
      diagnose: undefined,
      sync: undefined,
    };
  }
  const require = createRequire(pathToFileURL(join(cwd, "noop.js")));
  let resolved: string;
  try {
    resolved = require.resolve(adapter.commandsModule);
  } catch (cause) {
    throw PlumixCliError.runtimeCommandsNotFound({
      commandsModule: adapter.commandsModule,
      cwd,
      cause,
    });
  }
  try {
    const href = pathToFileURL(resolved).href;
    // A loader per call: the specifier varies, so there is no one module to keep.
    const mod = (await loadOnce(() => import(href))()) as {
      default?: CommandRegistry;
      commands?: CommandRegistry;
      migrations?: RuntimeMigrations;
      diagnose?: RuntimeDiagnose;
      sync?: RuntimeSync;
    };
    return {
      commands: mod.commands ?? mod.default ?? {},
      migrations: mod.migrations,
      diagnose: mod.diagnose,
      sync: mod.sync,
    };
  } catch (cause) {
    // A commands module that refuses to load says why in its own terms.
    if (isCliError(cause)) throw cause;
    throw PlumixCliError.runtimeCommandsLoadFailed({
      commandsModule: adapter.commandsModule,
      cause,
    });
  }
}

function resolveCommand(
  runtimeCommands: CommandRegistry,
  name: string,
): CommandDefinition<PlumixApp> | undefined {
  return BUILT_IN_COMMANDS.get(name) ?? runtimeCommands[name];
}

function readVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export { exitWithError };
