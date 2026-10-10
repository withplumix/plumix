import { afterEach, describe, expect, test } from "vitest";

import type { CommandDefinition, PlumixConfig } from "@plumix/core";
import { auth, definePlugin, plumix } from "@plumix/core";

import { resolveCommandApp } from "./index.js";

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
