import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  CommandDefinition,
  CommandRegistry,
  PlumixApp,
  PlumixConfig,
  RuntimeAdapter,
  RuntimeMigrations,
} from "@plumix/core";
import { isCliError } from "@plumix/core/cli";

import type { CommandGroup } from "./help.js";
import type { LoadedConfig } from "./load-config.js";
import { cronCommand } from "./commands/cron.js";
import { doctorCommand } from "./commands/doctor.js";
import { i18nCommand } from "./commands/i18n.js";
import { metaCommand } from "./commands/meta.js";
import { migrateCommand } from "./commands/migrate.js";
import { PlumixCliError } from "./errors.js";
import { formatHelp } from "./help.js";
import { loadConfig } from "./load-config.js";
import { badge, exitWithError, report } from "./report.js";

// A built-in may read the whole app — `meta` and `cron` build the site's
// handler from it; a runtime's own commands see only its `CommandApp` part.
const BUILT_IN_COMMANDS: ReadonlyMap<
  string,
  CommandDefinition<PlumixApp>
> = new Map<string, CommandDefinition<PlumixApp>>([
  ["migrate", migrateCommand],
  ["cron", cronCommand],
  ["meta", metaCommand],
  ["doctor", doctorCommand],
  ["i18n", i18nCommand],
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
  // flags like `--remote` survive.
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

  if (args.version) {
    report.info(readVersion());
    return;
  }

  if (args.command === undefined || args.command === "help" || args.help) {
    await printHelp(args);
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

  const app = await resolveCommandApp(command, loaded.config, args.command);
  await command.run({
    app,
    cwd: args.cwd,
    configPath: loaded.configPath,
    argv: args.rest,
    runtimeMigrations: runtimeModule.migrations,
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
  // Deferred: core's root barrel costs ~500ms to evaluate, and `dev`,
  // `--version`, `--help` and `i18n` never need it.
  const { buildApp } = await import("@plumix/core");
  return buildApp(config);
}

// Throws on any property read so code reaching for `ctx.app` fails loud. `then`
// is exempt so the sentinel survives `await`.
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

async function printHelp(args: CliArgs): Promise<void> {
  let loaded: LoadedConfig | undefined;
  let runtimeModule: RuntimeCommandsModule = {
    commands: {},
    migrations: undefined,
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
  report.info(formatHelp(buildGroups(loaded, runtimeModule.commands)));
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
}

async function loadRuntimeCommands(
  adapter: RuntimeAdapter,
  cwd: string,
): Promise<RuntimeCommandsModule> {
  if (!adapter.commandsModule) return { commands: {}, migrations: undefined };
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
    const mod = (await import(pathToFileURL(resolved).href)) as {
      default?: CommandRegistry;
      commands?: CommandRegistry;
      migrations?: RuntimeMigrations;
    };
    return {
      commands: mod.commands ?? mod.default ?? {},
      migrations: mod.migrations,
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
