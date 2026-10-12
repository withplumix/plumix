import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  CommandDefinition,
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
      remote: false,
      legacyTable: "__drizzle_migrations",
      open: ({ location }) => {
        events.push(`open ${location}`);
        return Promise.resolve({
          migrate: ({ migrationsTable }) => {
            events.push(`migrate ${migrationsTable}`);
            return Promise.resolve();
          },
          all: () => Promise.resolve([]),
          batch: () => Promise.resolve(),
          close: () => {
            events.push("close");
            return Promise.resolve();
          },
        });
      },
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
      },
    );
  }

  test("dev applies every owner and closes the database before the runtime's dev opens it", async () => {
    vi.spyOn(report, "info").mockImplementation(() => undefined);
    const events: string[] = [];

    await runNamed("dev", events);

    expect(events).toEqual([
      "open local",
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
});
