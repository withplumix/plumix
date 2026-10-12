import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  CommandDefinition,
  PlumixConfig,
  RuntimeMigrations,
} from "@plumix/core";
import { auth, definePlugin, plumix } from "@plumix/core";

import { resolveCommandApp, runCommand } from "./index.js";
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

  function run(name: string, events: string[]): Promise<void> {
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

    await run("dev", events);

    expect(events).toEqual([
      "open local",
      "migrate __drizzle_migrations_core",
      "close",
      "run dev",
    ]);
  });

  test("another command runs without migrating", async () => {
    const events: string[] = [];

    await run("build", events);

    expect(events).toEqual(["run build"]);
  });
});
