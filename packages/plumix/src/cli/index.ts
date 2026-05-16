import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type {
  CommandDefinition,
  CommandRegistry,
  RuntimeAdapter,
} from "@plumix/core";
import { buildApp, CliError } from "@plumix/core";

import type { CommandGroup } from "./help.js";
import type { LoadedConfig } from "./load-config.js";
import { doctorCommand } from "./commands/doctor.js";
import { migrateCommand } from "./commands/migrate.js";
import { formatHelp } from "./help.js";
import { loadConfig } from "./load-config.js";
import { exitWithError, report } from "./report.js";

const BUILT_IN_COMMANDS: ReadonlyMap<string, CommandDefinition> = new Map([
  ["migrate", migrateCommand],
  ["doctor", doctorCommand],
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
  // Eat plumix-level flags from the start of argv. The first non-plumix
  // token (positional or unknown flag) becomes the command name; every
  // token after that passes through unparsed so subcommand flags like
  // `--remote` aren't dropped by node:util.parseArgs.
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
    // First non-plumix token: command name (or, if it's a flag, subcommand-only).
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

  const loaded = await loadConfig(args.cwd, args.config);
  const runtimeModule = await loadRuntimeCommands(
    loaded.config.runtime,
    args.cwd,
  );
  const command = resolveCommand(runtimeModule.commands, args.command);
  if (!command) {
    throw CliError.unknownCommand({ command: args.command });
  }

  const app = await buildApp(loaded.config);
  await command.run({
    app,
    cwd: args.cwd,
    configPath: loaded.configPath,
    argv: args.rest,
    runtimeMigrate: runtimeModule.migrate,
  });
}

async function printHelp(args: CliArgs): Promise<void> {
  let loaded: LoadedConfig | undefined;
  let runtimeModule: RuntimeCommandsModule = { commands: {}, migrate: {} };
  try {
    loaded = await loadConfig(args.cwd, args.config);
    runtimeModule = await loadRuntimeCommands(loaded.config.runtime, args.cwd);
  } catch (error) {
    // Help is still useful with no config loaded; surface the reason in verbose.
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
  readonly migrate: CommandRegistry;
}

async function loadRuntimeCommands(
  adapter: RuntimeAdapter,
  cwd: string,
): Promise<RuntimeCommandsModule> {
  if (!adapter.commandsModule) return { commands: {}, migrate: {} };
  const require = createRequire(pathToFileURL(join(cwd, "noop.js")));
  let resolved: string;
  try {
    resolved = require.resolve(adapter.commandsModule);
  } catch (cause) {
    throw CliError.runtimeCommandsNotFound({
      commandsModule: adapter.commandsModule,
      cwd,
      cause,
    });
  }
  try {
    const mod = (await import(pathToFileURL(resolved).href)) as {
      default?: CommandRegistry;
      commands?: CommandRegistry;
      migrate?: CommandRegistry;
    };
    return {
      commands: mod.commands ?? mod.default ?? {},
      migrate: mod.migrate ?? {},
    };
  } catch (cause) {
    throw CliError.runtimeCommandsLoadFailed({
      commandsModule: adapter.commandsModule,
      cause,
    });
  }
}

function resolveCommand(
  runtimeCommands: CommandRegistry,
  name: string,
): CommandDefinition | undefined {
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
