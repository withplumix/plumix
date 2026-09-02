import { describe, expect, test } from "vitest";

import { defineBlock } from "@plumix/blocks";

import { auth } from "../auth/config.js";
import { plumix } from "../config.js";
import { definePlugin } from "../plugin/define.js";
import { fallback } from "../route/render/template-builders.js";
import { defineTheme } from "../theme.js";
import { buildApp } from "./app.js";

const stubAdapter = {
  name: "test" as const,
  createHandler: () => ({ fetch: () => new Response("stub") }),
  generateEntry: () => "",
};
const stubDatabase = { kind: "test", connect: () => ({ db: {} }) } as const;
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "t", origin: "https://t" },
});

describe("buildApp — block aggregation", () => {
  test("registers theme-contributed blocks", async () => {
    const chart = defineBlock({ name: "eduscope/chart", render: () => null });
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({
          templates: [fallback(() => null)],
          blocks: [chart],
        }),
      }),
    );
    expect(app.blocks.has("eduscope/chart")).toBe(true);
  });

  test("a theme block wins precedence over a plugin block of the same name", async () => {
    const themeVersion = defineBlock({
      name: "shared/card",
      render: () => null,
    });
    const pluginVersion = defineBlock({
      name: "shared/card",
      render: () => null,
    });
    const plugin = definePlugin("provider", (ctx) => {
      ctx.registerBlock(pluginVersion);
    });
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        plugins: [plugin],
        theme: defineTheme({
          templates: [fallback(() => null)],
          blocks: [themeVersion],
        }),
      }),
    );
    expect(app.blocks.get("shared/card")).toBe(themeVersion);
  });

  test("boots a theme that omits `blocks`", async () => {
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({ templates: [fallback(() => null)] }),
      }),
    );
    // Core baseline intact; the `?? []` fallback didn't disturb it.
    expect(app.blocks.has("core/rich-text")).toBe(true);
  });

  test("registers multiple theme blocks", async () => {
    const chart = defineBlock({ name: "eduscope/chart", render: () => null });
    const callout = defineBlock({
      name: "eduscope/callout",
      render: () => null,
    });
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({
          templates: [fallback(() => null)],
          blocks: [chart, callout],
        }),
      }),
    );
    expect(app.blocks.has("eduscope/chart")).toBe(true);
    expect(app.blocks.has("eduscope/callout")).toBe(true);
  });

  test("rejects a theme block in the reserved `core/` namespace", () => {
    expect(() =>
      defineTheme({
        templates: [fallback(() => null)],
        blocks: [defineBlock({ name: "core/rich-text", render: () => null })],
      }),
    ).toThrow(/core\//);
  });

  test("rejects a plugin block in the reserved `core/` namespace", async () => {
    const plugin = definePlugin("squatter", (ctx) => {
      ctx.registerBlock(
        defineBlock({ name: "core/button", render: () => null }),
      );
    });
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          plugins: [plugin],
          theme: defineTheme({ templates: [fallback(() => null)] }),
        }),
      ),
    ).rejects.toThrow(/core\//);
  });

  test("rejects two plugins registering the same block name", async () => {
    const a = definePlugin("a", (ctx) => {
      ctx.registerBlock(defineBlock({ name: "dup/x", render: () => null }));
    });
    const b = definePlugin("b", (ctx) => {
      ctx.registerBlock(defineBlock({ name: "dup/x", render: () => null }));
    });
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          plugins: [a, b],
          theme: defineTheme({ templates: [fallback(() => null)] }),
        }),
      ),
    ).rejects.toThrow(/dup\/x/);
  });
});
