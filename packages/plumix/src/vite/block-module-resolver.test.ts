import { describe, expect, test } from "vitest";

import {
  extractBlockModules,
  extractRegisteredBlockModules,
  resolveBlockModulePaths,
} from "./block-module-resolver.js";

// Real config modules always import the factory from `plumix`; the extractor
// requires that provenance, so fixtures carry the import too.
const THEME = `import { defineTheme } from "plumix";`;
const PLUGIN = `import { definePlugin } from "plumix/plugin";`;

const ref = (module: string, exportName = "default") => ({
  module,
  exportName,
});

describe("extractBlockModules", () => {
  test("recovers the module behind a default-imported `blocks` binding", () => {
    const result = extractBlockModules(
      `${THEME}
       import blocks from "./blocks";
       export default defineTheme({ templates: [], blocks });`,
    );
    expect(result).toEqual({ ok: true, modules: [ref("./blocks")] });
  });

  test("recovers the module behind a renamed binding (`blocks: b`)", () => {
    const result = extractBlockModules(
      `${THEME}
       import b from "./blocks";
       export default defineTheme({ blocks: b });`,
    );
    expect(result).toEqual({ ok: true, modules: [ref("./blocks")] });
  });

  test("carries the named export behind a named `blocks` import", () => {
    const result = extractBlockModules(
      `${THEME}
       import { blocks } from "./blocks";
       export default defineTheme({ blocks });`,
    );
    expect(result).toEqual({ ok: true, modules: [ref("./blocks", "blocks")] });
  });

  test("rejects a namespace `blocks` import (a module object, not a BlockSpec[])", () => {
    const result = extractBlockModules(
      `${THEME}
       import * as blocks from "./blocks";
       export default defineTheme({ blocks });`,
    );
    expect(result.ok).toBe(false);
  });

  test("rejects a non-identifier (string-literal) export name binding", () => {
    // `import { "weird-name" as blocks }` can't be regenerated as an import, so
    // the binding is not recorded and the field is rejected.
    const result = extractBlockModules(
      `${THEME}
       import { "weird-name" as blocks } from "./blocks";
       export default defineTheme({ blocks });`,
    );
    expect(result.ok).toBe(false);
  });

  test("recovers every module from an array of imported spreads", () => {
    const result = extractBlockModules(
      `${THEME}
       import charts from "./charts";
       import callouts from "./callouts";
       export default defineTheme({ blocks: [...charts, ...callouts] });`,
    );
    expect(result).toEqual({
      ok: true,
      modules: [ref("./charts"), ref("./callouts")],
    });
  });

  test("resolves a string-literal `blocks` key", () => {
    const result = extractBlockModules(
      `${THEME}
       import blocks from "./blocks";
       export default defineTheme({ "blocks": blocks });`,
    );
    expect(result).toEqual({ ok: true, modules: [ref("./blocks")] });
  });

  test("finds the factory even when imported under an alias", () => {
    const result = extractBlockModules(
      `import blocks from "./blocks";
       import { defineTheme as dt } from "plumix";
       export default dt({ blocks });`,
    );
    expect(result).toEqual({ ok: true, modules: [ref("./blocks")] });
  });

  test("parses TypeScript syntax directly — no type-stripping step", () => {
    const result = extractBlockModules(
      `${THEME}
       import blocks from "./blocks";
       const cfg: ThemeConfig = defineTheme({ blocks }) satisfies ThemeConfig;
       export default cfg;`,
    );
    expect(result).toEqual({ ok: true, modules: [ref("./blocks")] });
  });

  test("returns no modules when the config declares no `blocks`", () => {
    const result = extractBlockModules(
      `${THEME}
       export default defineTheme({ templates: [] });`,
    );
    expect(result).toEqual({ ok: true, modules: [] });
  });

  // --- rejections ---

  test("rejects a computed `blocks` value (not statically resolvable)", () => {
    const result = extractBlockModules(
      `${THEME}
       import a from "./a";
       import b from "./b";
       export default defineTheme({ blocks: cond ? a : b });`,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/import/i);
  });

  test("rejects a type-only `blocks` import (no runtime binding)", () => {
    const result = extractBlockModules(
      `${THEME}
       import type { blocks } from "./blocks";
       export default defineTheme({ blocks });`,
    );
    expect(result.ok).toBe(false);
  });

  test("finds blocks in a `definePlugin(id, { … })` input-form call", () => {
    const result = extractBlockModules(
      `${PLUGIN}
       import blocks from "./blocks.js";
       export default definePlugin("media", { setup: () => {}, blocks });`,
    );
    expect(result).toEqual({ ok: true, modules: [ref("./blocks.js")] });
  });

  test("finds blocks in a `definePlugin(id, setup, { … })` legacy-form call", () => {
    const result = extractBlockModules(
      `${PLUGIN}
       import blocks from "./blocks.js";
       export default definePlugin("media", () => {}, { blocks });`,
    );
    expect(result).toEqual({ ok: true, modules: [ref("./blocks.js")] });
  });

  // --- provenance + call selection (senpai findings) ---

  test("ignores a nested factory call and keeps the outer config's blocks", () => {
    const result = extractBlockModules(
      `import { defineTheme, definePlugin } from "plumix";
       import blocks from "./blocks";
       export default defineTheme({
         blocks,
         plugins: [definePlugin({ name: "x" })],
       });`,
    );
    expect(result).toEqual({ ok: true, modules: [ref("./blocks")] });
  });

  test("a nested factory's own blocks never overwrite the outer config's", () => {
    const result = extractBlockModules(
      `import { defineTheme, definePlugin } from "plumix";
       import blocks from "./blocks";
       import other from "./other";
       export default defineTheme({
         blocks,
         plugins: [definePlugin({ blocks: other })],
       });`,
    );
    expect(result).toEqual({ ok: true, modules: [ref("./blocks")] });
  });

  test("picks the top-level factory call that actually declares blocks", () => {
    const result = extractBlockModules(
      `import { defineTheme, definePlugin } from "plumix";
       import blocks from "./blocks";
       export const theme = defineTheme({ blocks });
       export const plugin = definePlugin({ templates: [] });`,
    );
    expect(result).toEqual({ ok: true, modules: [ref("./blocks")] });
  });

  test("a local look-alike (not imported from plumix) is not treated as a factory", () => {
    const result = extractBlockModules(
      `import { defineTheme } from "plumix";
       import blocks from "./blocks";
       export const theme = defineTheme({ blocks });
       function definePlugin(x) { return x; }
       const log = definePlugin({ note: "unrelated" });`,
    );
    expect(result).toEqual({ ok: true, modules: [ref("./blocks")] });
  });
});

describe("extractRegisteredBlockModules", () => {
  test("traces a `ctx.registerBlock(x)` argument to its import", () => {
    const modules = extractRegisteredBlockModules(
      `${PLUGIN}
       import { imageBlock } from "./blocks/image.js";
       export default definePlugin("media", (ctx) => {
         ctx.registerBlock(imageBlock);
       });`,
    );
    expect(modules).toEqual([ref("./blocks/image.js", "imageBlock")]);
  });

  test("traces every element of a `ctx.registerBlocks([…])` array", () => {
    const modules = extractRegisteredBlockModules(
      `${PLUGIN}
       import image from "./image.js";
       import file from "./file.js";
       export default definePlugin("media", (ctx) => {
         ctx.registerBlocks([image, file]);
       });`,
    );
    expect(modules).toEqual([ref("./image.js"), ref("./file.js")]);
  });

  test("traces a `ctx.registerBlocks(arr)` named array binding", () => {
    const modules = extractRegisteredBlockModules(
      `${PLUGIN}
       import { mediaBlocks } from "./media-blocks.js";
       export default definePlugin("media", (ctx) => {
         ctx.registerBlocks(mediaBlocks);
       });`,
    );
    expect(modules).toEqual([ref("./media-blocks.js", "mediaBlocks")]);
  });

  test("skips a registered block that isn't an imported binding", () => {
    const modules = extractRegisteredBlockModules(
      `${PLUGIN}
       import { imageBlock } from "./image.js";
       export default definePlugin("media", (ctx) => {
         ctx.registerBlock(imageBlock);
         ctx.registerBlock(makeBlock());
       });`,
    );
    expect(modules).toEqual([ref("./image.js", "imageBlock")]);
  });

  test("ignores a `.registerBlock` call outside a plumix definePlugin", () => {
    const modules = extractRegisteredBlockModules(
      `import thing from "./thing.js";
       someOtherLib.registerBlock(thing);`,
    );
    expect(modules).toEqual([]);
  });

  test("returns nothing when there are no register calls", () => {
    const modules = extractRegisteredBlockModules(
      `${PLUGIN}
       export default definePlugin("x", (ctx) => { ctx.registerEntryType("y", {}); });`,
    );
    expect(modules).toEqual([]);
  });
});

describe("resolveBlockModulePaths", () => {
  test("resolves plugin blocks from `registerBlocks` call sites", () => {
    const paths = resolveBlockModulePaths(
      `${PLUGIN}
       import { mediaBlocks } from "./media-blocks.js";
       export default definePlugin("media", (ctx) => {
         ctx.registerBlocks(mediaBlocks);
       });`,
      "/pkgs/media/dist/index.js",
    );
    expect(paths).toEqual([
      ref("/pkgs/media/dist/media-blocks.js", "mediaBlocks"),
    ]);
  });

  test("resolves a relative specifier against the module's directory", () => {
    const paths = resolveBlockModulePaths(
      `import { defineTheme } from "plumix";
       import blocks from "./blocks.js";
       export default defineTheme({ blocks });`,
      "/app/theme/index.ts",
    );
    expect(paths).toEqual([ref("/app/theme/blocks.js")]);
  });

  test("passes a bare package specifier through unchanged", () => {
    const paths = resolveBlockModulePaths(
      `import { definePlugin } from "plumix/plugin";
       import blocks from "@scope/pkg/blocks";
       export default definePlugin({ blocks });`,
      "/pkgs/thing/dist/index.js",
    );
    expect(paths).toEqual([ref("@scope/pkg/blocks")]);
  });

  test("returns no paths when the module declares no blocks", () => {
    const paths = resolveBlockModulePaths(
      `import { defineTheme } from "plumix";
       export default defineTheme({ templates: [] });`,
      "/app/theme/index.ts",
    );
    expect(paths).toEqual([]);
  });

  test("throws with the module path when the blocks binding is unresolvable", () => {
    expect(() =>
      resolveBlockModulePaths(
        `import { defineTheme } from "plumix";
         export default defineTheme({ blocks: loadBlocks() });`,
        "/app/theme/index.ts",
      ),
    ).toThrow(/\/app\/theme\/index\.ts/);
  });
});
