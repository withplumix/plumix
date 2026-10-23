import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  CommandDefinition,
  MigrationDatabase,
  PlumixConfig,
  RuntimeMigrations,
} from "@plumix/core";
import { auth, definePlugin, plumix } from "@plumix/core";

import { resolveCommandApp, run, runCommand } from "./index.js";
import { report } from "./report.js";

const command = (overrides: Partial<CommandDefinition>): CommandDefinition => ({
  describe: "test",
  run: () => undefined,
  ...overrides,
});

/**
 * Plugin setup runs during app assembly, so its registration shows whether the
 * build happened.
 */
const registrations: string[] = [];

function testConfig(): PlumixConfig {
  return plumix({
    runtime: {
      name: "test",
      handler: {},
      generateEntry: () => "",
    },
    database: { kind: "test", connect: () => ({ db: {} }) },
    auth: auth({
      passkey: {
        rpName: "Plumix Test",
        rpId: "cms.example",
        origin: "https://cms.example",
      },
    }),
    plugins: [
      definePlugin("probe", () => {
        registrations.push("probe");
      }),
    ],
  });
}

afterEach(() => {
  registrations.length = 0;
});

describe("resolveCommandApp", () => {
  test("eagerly builds the app for a command that consumes it", async () => {
    const config = testConfig();

    const resolved = await resolveCommandApp(command({}), config, "build");

    expect(resolved.config).toBe(config);
    expect(registrations).toEqual(["probe"]);
  });

  test("skips the eager build when the command defers the app to its runtime", async () => {
    await resolveCommandApp(command({ deferApp: true }), testConfig(), "dev");

    expect(registrations).toEqual([]);
  });

  test("the deferred app is a sentinel that throws loud on any access", async () => {
    const sentinel = await resolveCommandApp(
      command({ deferApp: true }),
      testConfig(),
      "dev",
    );

    expect(() => sentinel.config).toThrow(/ctx\.app is not available/);
  });
});

describe("runCommand", () => {
  function recordingRuntime(events: string[]): RuntimeMigrations {
    return {
      legacyTable: "__drizzle_migrations",
      open: ({ location }) => {
        events.push(`open ${location}`);
        return Promise.resolve({
          // No owner here declares a data migration, so nothing reads it.
          drizzle: {} as MigrationDatabase["drizzle"],
          migrate: ({ migrationsTable }) => {
            events.push(`migrate ${migrationsTable}`);
            return Promise.resolve();
          },
          all: () => Promise.resolve([]),
          batch: () => Promise.resolve(),
          wipe: () => Promise.resolve(),
          close: () => {
            events.push("close");
            return Promise.resolve();
          },
          target: { remote: false, summary: "local", notes: [], name: "local" },
        });
      },
      openRun: () => Promise.reject(new Error("no command here runs the site")),
    };
  }

  function runNamed(name: string, events: string[]): Promise<void> {
    return runCommand(
      name,
      command({
        deferApp: true,
        run: () => {
          events.push(`run ${name}`);
        },
      }),
      {
        cwd: process.cwd(),
        argv: [],
        loaded: { config: testConfig(), configPath: "/site/plumix.config.ts" },
        runtimeMigrations: recordingRuntime(events),
        runtimeDiagnose: undefined,
        runtimeSync: undefined,
      },
    );
  }

  test("dev applies every owner and closes the database before the runtime's dev opens it", async () => {
    vi.spyOn(report, "info").mockImplementation(() => undefined);
    const events: string[] = [];

    await runNamed("dev", events);

    expect(events).toEqual([
      "open site",
      "migrate __drizzle_migrations_core",
      "close",
      "run dev",
    ]);
  });

  test("another command runs without migrating", async () => {
    const events: string[] = [];

    await runNamed("build", events);

    expect(events).toEqual(["run build"]);
  });
});

/**
 * A config that records whether it was evaluated as `plumix dev`, the way
 * core's `plumix()` reads it to let a dev site go without a mailer.
 */
const DEV_PROBE = `
(globalThis as unknown as Record<string, unknown>).__plumixConfigDev =
  process.env.PLUMIX_DEV ?? "";
export default {
  runtime: { name: "test", handler: {}, generateEntry: () => "" },
  database: { kind: "d1" },
  auth: { passkey: {} },
};
`;

const probe = globalThis as unknown as { __plumixConfigDev?: string };

describe("run", () => {
  const original = process.env.PLUMIX_DEV;
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
    if (original === undefined) delete process.env.PLUMIX_DEV;
    else process.env.PLUMIX_DEV = original;
    delete probe.__plumixConfigDev;
  });

  // The fixture's runtime ships no commands, so each run stops at an unknown
  // command after the config has loaded.
  test.each([
    ["dev", "1"],
    ["build", ""],
  ])(
    "`plumix %s` evaluates the config with PLUMIX_DEV=%j",
    async (name, dev) => {
      delete process.env.PLUMIX_DEV;
      const dir = mkdtempSync(join(tmpdir(), "plumix-run-"));
      dirs.push(dir);
      writeFileSync(join(dir, "plumix.config.ts"), DEV_PROBE);

      await expect(run(["--cwd", dir, name])).rejects.toThrow(name);

      expect(probe.__plumixConfigDev).toBe(dev);
    },
  );

  test("a commands module that refuses to load with its own CliError is reported in its terms", async () => {
    const dir = mkdtempSync(join(tmpdir(), "plumix-run-"));
    dirs.push(dir);
    const commandsModule = join(dir, "commands.ts");
    writeFileSync(
      commandsModule,
      `import { CliError } from "@plumix/core/cli";
class RefusingCliError extends CliError {}
throw new RefusingCliError("refused_here", "This runtime's commands refuse", "Run them elsewhere.", undefined);
`,
    );
    writeFileSync(
      join(dir, "plumix.config.ts"),
      `export default {
  runtime: { name: "test", handler: {}, generateEntry: () => "", commandsModule: ${JSON.stringify(commandsModule)} },
  database: { kind: "d1" },
  auth: { passkey: {} },
};
`,
    );

    const running = run(["--cwd", dir, "build"]);

    await expect(running).rejects.toMatchObject({
      code: "refused_here",
      hint: "Run them elsewhere.",
    });
  });

  test("a commands module's sync export reaches a command as its runtimeSync", async () => {
    const dir = mkdtempSync(join(tmpdir(), "plumix-run-"));
    dirs.push(dir);
    const commandsModule = join(dir, "commands.ts");
    writeFileSync(
      commandsModule,
      `export const sync = { open: () => Promise.reject(new Error("unused")) };
export const commands = {
  probe: {
    describe: "probe",
    deferApp: true,
    run: (ctx) => {
      (globalThis as unknown as Record<string, unknown>).__plumixRuntimeSync = ctx.runtimeSync === sync;
    },
  },
};
`,
    );
    writeFileSync(
      join(dir, "plumix.config.ts"),
      `export default {
  runtime: { name: "test", handler: {}, generateEntry: () => "", commandsModule: ${JSON.stringify(commandsModule)} },
  database: { kind: "d1" },
  auth: { passkey: {} },
};
`,
    );

    await run(["--cwd", dir, "probe"]);

    expect(
      (globalThis as unknown as Record<string, unknown>).__plumixRuntimeSync,
    ).toBe(true);
  });
});

/**
 * A stand-in for the Cloudflare commands module: `deploy`, `preview`, `dev`
 * and migrations with a target option, each recording that it ran.
 */
const SHIP_COMMANDS = `
const ran = ((globalThis as unknown as Record<string, unknown>).__plumixRan ??= []) as string[];
const ship = (name: string) => ({
  describe: \`Build, migrate, then \${name} (any other options go to wrangler \${name})\`,
  deferApp: true,
  run: () => { ran.push(\`run \${name}\`); },
});
export const migrations = {
  legacyTable: "__drizzle_migrations",
  targetOptions: { production: { type: "boolean", description: "The production D1" } },
  open: () => { ran.push("migrate"); return Promise.reject(new Error("migrated")); },
  openRun: () => Promise.reject(new Error("unused")),
};
export const commands = { deploy: ship("deploy"), preview: ship("preview"), dev: ship("dev") };
`;

describe("run — a command's --help", () => {
  const dirs: string[] = [];
  const ran = globalThis as unknown as { __plumixRan?: string[] };
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
    delete ran.__plumixRan;
    vi.restoreAllMocks();
  });

  function shipSite(): string {
    const dir = mkdtempSync(join(tmpdir(), "plumix-help-"));
    dirs.push(dir);
    const commandsModule = join(dir, "commands.ts");
    writeFileSync(commandsModule, SHIP_COMMANDS);
    writeFileSync(
      join(dir, "plumix.config.ts"),
      `export default {
  runtime: { name: "cloudflare", handler: {}, generateEntry: () => "", commandsModule: ${JSON.stringify(commandsModule)} },
  database: { kind: "d1" },
  auth: { passkey: {} },
};
`,
    );
    return dir;
  }

  test.each([
    ["deploy", "--help"],
    ["deploy", "-h"],
    ["preview", "--help"],
    ["preview", "-h"],
  ])(
    "`plumix %s %s` prints the command's help and runs nothing",
    async (name, flag) => {
      const info = vi.spyOn(report, "info").mockImplementation(() => undefined);

      await run(["--cwd", shipSite(), name, flag]);

      expect(ran.__plumixRan ?? []).toEqual([]);
      expect(info).toHaveBeenCalledOnce();
      expect(info.mock.calls[0]?.[0]).toContain(
        [
          "Usage:",
          `  plumix ${name} [options]`,
          "",
          `Build, migrate, then ${name} (any other options go to wrangler ${name})`,
          "",
          "cloudflare runtime target options (migrate, meta):",
          "  --production    The production D1",
        ].join("\n"),
      );
    },
  );

  test("`plumix dev --help` neither migrates the local database nor starts dev", async () => {
    vi.spyOn(report, "info").mockImplementation(() => undefined);

    await run(["--cwd", shipSite(), "dev", "--help"]);

    expect(ran.__plumixRan ?? []).toEqual([]);
  });

  test("--help counts anywhere among the command's arguments", async () => {
    const info = vi.spyOn(report, "info").mockImplementation(() => undefined);

    await run(["--cwd", shipSite(), "deploy", "--env", "staging", "--help"]);

    expect(ran.__plumixRan ?? []).toEqual([]);
    expect(info.mock.calls[0]?.[0]).toContain("  plumix deploy [options]");
  });

  test("an unknown command's --help still fails as an unknown command", async () => {
    await expect(
      run(["--cwd", shipSite(), "launch", "--help"]),
    ).rejects.toMatchObject({ code: "unknown_command" });
  });

  test("a built-in's help prints without the target options when the config can't load", async () => {
    const dir = mkdtempSync(join(tmpdir(), "plumix-help-"));
    dirs.push(dir);
    const info = vi.spyOn(report, "info").mockImplementation(() => undefined);

    await run(["--cwd", dir, "migrate", "--help"]);

    expect(info.mock.calls[0]?.[0]).toContain("  plumix migrate [options]");
    expect(info.mock.calls[0]?.[0]).not.toContain("target options");
  });
});
