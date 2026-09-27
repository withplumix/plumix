import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  collectEditorBlockModules,
  collectEditorShortcodeModules,
} from "./editor-block-modules.js";

describe("collectEditorBlockModules", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-editor-blocks-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const configPath = () => join(dir, "plumix.config.ts");
  const write = (rel: string, content: string) => {
    const path = join(dir, rel);
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, content, "utf8");
  };

  test("resolves a theme's block module to its real source file", () => {
    write("theme/blocks.ts", "export default [];");
    write(
      "theme/index.ts",
      `import { defineTheme } from "plumix/theme";
       import blocks from "./blocks.js";
       export default defineTheme({ blocks });`,
    );
    const source = `import { plumix } from "plumix";
       import { theme } from "./theme";
       export default plumix({ theme });`;
    write("plumix.config.ts", source);

    const result = collectEditorBlockModules(configPath(), source);
    // The authored `./blocks.js` maps back to the real `blocks.ts` on disk,
    // taking the module's default export.
    expect(result).toEqual([
      { module: join(dir, "theme/blocks.ts"), exportName: "default" },
    ]);
  });

  test("resolves a plugin's `registerBlocks` named binding to its export", () => {
    write("plugin/blocks.ts", "export const blocks = [];");
    write(
      "plugin/index.ts",
      `import { definePlugin } from "plumix/plugin";
       import { blocks } from "./blocks.js";
       export default definePlugin("p", (ctx) => {
         ctx.registerBlocks(blocks);
       });`,
    );
    const source = `import { plumix } from "plumix";
       import p from "./plugin";
       export default plumix({ plugins: [p()] });`;
    write("plumix.config.ts", source);

    // The named binding is preserved so the codegen imports `{ blocks }`, not a
    // (missing) default — the fix for the named-vs-default canvas regression.
    expect(collectEditorBlockModules(configPath(), source)).toEqual([
      { module: join(dir, "plugin/blocks.ts"), exportName: "blocks" },
    ]);
  });

  test("returns nothing for a theme that declares no blocks", () => {
    write(
      "theme/index.ts",
      `import { defineTheme } from "plumix/theme";
       export default defineTheme({ templates: [] });`,
    );
    const source = `import { plumix } from "plumix";
       import { theme } from "./theme";
       export default plumix({ theme });`;
    write("plumix.config.ts", source);

    expect(collectEditorBlockModules(configPath(), source)).toEqual([]);
  });

  test("skips a theme module that can't be located", () => {
    const source = `import { plumix } from "plumix";
       import { theme } from "./missing-theme";
       export default plumix({ theme });`;
    write("plumix.config.ts", source);

    expect(collectEditorBlockModules(configPath(), source)).toEqual([]);
  });

  test("orders plugin shortcode modules before the theme's, so the theme wins", () => {
    write("plugin/shortcodes.ts", "export const shortcodes = [];");
    write(
      "plugin/index.ts",
      `import { definePlugin } from "plumix/plugin";
       import { shortcodes } from "./shortcodes.js";
       export default definePlugin("p", { setup: () => {}, shortcodes });`,
    );
    write("theme/shortcodes.ts", "export default [];");
    write(
      "theme/index.ts",
      `import { defineTheme } from "plumix/theme";
       import shortcodes from "./shortcodes.js";
       export default defineTheme({ shortcodes });`,
    );
    const source = `import { plumix } from "plumix";
       import p from "./plugin";
       import { theme } from "./theme";
       export default plumix({ theme, plugins: [p()] });`;
    write("plumix.config.ts", source);

    // The canvas registry is last-write-wins, so this order is the
    // `core < plugin < theme` precedence the server registry gives.
    expect(collectEditorShortcodeModules(configPath(), source)).toEqual([
      { module: join(dir, "plugin/shortcodes.ts"), exportName: "shortcodes" },
      { module: join(dir, "theme/shortcodes.ts"), exportName: "default" },
    ]);
  });
});
