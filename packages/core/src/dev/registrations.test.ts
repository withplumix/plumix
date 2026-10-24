import { afterEach, describe, expect, test } from "vitest";

import type { PluginSetupContext } from "../plugin/setup-context-types.js";
import { definePlugin } from "../plugin/define.js";
import { DuplicateRegistrationError } from "../plugin/errors.js";
import { buildApp } from "../runtime/app.js";
import { testConfig } from "../test/config.js";

type Register = (ctx: PluginSetupContext, id: string) => void;

const REGISTRATIONS: readonly (readonly [string, Register])[] = [
  [
    "debug panel",
    (ctx, id) => {
      ctx.registerDebugPanel({ id, title: id, render: () => null });
    },
  ],
  [
    "error panel",
    (ctx, id) => {
      ctx.registerErrorPanel({ id, title: id, render: () => null });
    },
  ],
  [
    "error hint",
    (ctx, id) => {
      ctx.registerErrorHint({ id, title: id, matches: () => true });
    },
  ],
];

describe("dev registrations", () => {
  const original = process.env.PLUMIX_DEV;
  afterEach(() => {
    if (original === undefined) delete process.env.PLUMIX_DEV;
    else process.env.PLUMIX_DEV = original;
  });

  test.each(REGISTRATIONS)(
    "a %s id two plugins register fails boot",
    async (kind, register) => {
      process.env.PLUMIX_DEV = "1";
      const first = definePlugin("first", {
        setup: (ctx) => register(ctx, "shared"),
      });
      const second = definePlugin("second", {
        setup: (ctx) => register(ctx, "shared"),
      });

      await expect(
        buildApp(testConfig({ plugins: [first, second] })),
      ).rejects.toMatchObject({
        name: "DuplicateRegistrationError",
        kind,
        identifier: "shared",
        pluginId: "second",
        previousOwner: "first",
      });
    },
  );

  test("a plugin registering a core debug panel's id fails boot", async () => {
    process.env.PLUMIX_DEV = "1";
    const shadowing = definePlugin("shadowing", {
      setup: (ctx) => {
        ctx.registerDebugPanel({
          id: "request",
          title: "Mine",
          render: () => null,
        });
      },
    });

    await expect(
      buildApp(testConfig({ plugins: [shadowing] })),
    ).rejects.toBeInstanceOf(DuplicateRegistrationError);
  });

  test("a runtime adapter's hint reusing a core hint's id fails boot", async () => {
    process.env.PLUMIX_DEV = "1";
    const runtime = {
      name: "edge",
      handler: {},
      generateEntry: () => "",
      errorHints: [{ id: "migrations", title: "Mine", matches: () => true }],
    };

    await expect(buildApp(testConfig({ runtime }))).rejects.toMatchObject({
      name: "DuplicateRegistrationError",
      kind: "error hint",
      identifier: "migrations",
      pluginId: "edge",
      previousOwner: null,
    });
  });

  test.each(REGISTRATIONS)(
    "a %s id registered twice outside plumix dev boots",
    async (_kind, register) => {
      process.env.PLUMIX_DEV = "";
      const first = definePlugin("first", {
        setup: (ctx) => register(ctx, "shared"),
      });
      const second = definePlugin("second", {
        setup: (ctx) => register(ctx, "shared"),
      });

      await expect(
        buildApp(testConfig({ plugins: [first, second] })),
      ).resolves.toBeDefined();
    },
  );
});
