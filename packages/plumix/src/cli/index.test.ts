import { afterEach, describe, expect, test, vi } from "vitest";

import type { CommandDefinition, PlumixApp, PlumixConfig } from "@plumix/core";
import { buildApp } from "@plumix/core";

import { resolveCommandApp } from "./index.js";

vi.mock("@plumix/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@plumix/core")>();
  return { ...actual, buildApp: vi.fn() };
});

const command = (overrides: Partial<CommandDefinition>): CommandDefinition => ({
  describe: "test",
  run: () => undefined,
  ...overrides,
});

const config = {} as PlumixConfig;

describe("resolveCommandApp", () => {
  afterEach(() => {
    vi.mocked(buildApp).mockReset();
  });

  test("eagerly builds the app for a command that consumes it", async () => {
    const app = {} as PlumixApp;
    vi.mocked(buildApp).mockResolvedValue(app);

    const resolved = await resolveCommandApp(command({}), config, "build");

    expect(buildApp).toHaveBeenCalledExactlyOnceWith(config);
    expect(resolved).toBe(app);
  });

  test("skips the eager build when the command defers the app to its runtime", async () => {
    await resolveCommandApp(command({ deferApp: true }), config, "dev");

    expect(buildApp).not.toHaveBeenCalled();
  });

  test("the deferred app is a sentinel that throws loud on any access", async () => {
    const sentinel = await resolveCommandApp(
      command({ deferApp: true }),
      config,
      "dev",
    );

    expect(() => sentinel.config).toThrowError(/ctx\.app is not available/);
  });
});
