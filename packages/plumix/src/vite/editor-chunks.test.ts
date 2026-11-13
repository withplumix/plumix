import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Rolldown } from "vite";
import { build } from "vite";
import { beforeAll, describe, expect, test } from "vitest";

import { plumixSourceResolver } from "@plumix/vitest-config/source-resolver";

import { eagerChunks } from "./test-support.js";

type OutputChunk = Rolldown.OutputChunk;

const PACKAGE_DIR = fileURLToPath(new URL("../../", import.meta.url));
const MEDIA_BLOCKS = fileURLToPath(
  new URL("../../../plugins/media/src/media-blocks.ts", import.meta.url),
);

const FIXTURE_FILES = {
  "entry.js": [
    'import { bootEditor } from "plumix/editor-runtime";',
    `import { mediaBlocks } from ${JSON.stringify(MEDIA_BLOCKS)};`,
    'import { fixtureBlock } from "./fixture.js";',
    "bootEditor({ blocks: [...mediaBlocks, fixtureBlock] });",
  ].join("\n"),
  "fixture.js": [
    'import { defineBlock } from "plumix/blocks";',
    "export const fixtureBlock = defineBlock({",
    '  name: "fixture/listing",',
    '  view: () => import("./fixture.view.js"),',
    "});",
  ].join("\n"),
  "fixture.view.js": [
    'import { createElement } from "react";',
    'import { sqliteTable, text } from "drizzle-orm/sqlite-core";',
    'import { FixtureIsland } from "./fixture-island.js";',
    'const listings = sqliteTable("listings", { title: text("title") });',
    "export const loaders = { table: () => Promise.resolve(listings) };",
    "export default function FixtureView() {",
    "  return createElement(FixtureIsland);",
    "}",
  ].join("\n"),
  "fixture-island.js": [
    'import { createElement, useState } from "react";',
    "export function FixtureIsland() {",
    "  const [count] = useState(0);",
    '  return createElement("output", null, count);',
    "}",
  ].join("\n"),
};

/** A module the editor entry must never load before it runs. */
const MUST_STAY_OUT: readonly (readonly [string, RegExp])[] = [
  ["the admin shell's editor", /admin-editor[\\/].*plumix-editor\.tsx?$/],
  ["@plumix/admin-ui", /[\\/]admin-ui[\\/]/],
  ["radix-ui", /[\\/]node_modules[\\/](?:radix-ui|@radix-ui)[\\/]/],
  ["highlight.js", /[\\/]node_modules[\\/]highlight\.js[\\/]/],
  ["dompurify", /[\\/]node_modules[\\/]dompurify[\\/]/],
  ["sanitize-html", /[\\/]node_modules[\\/]sanitize-html[\\/]/],
  ["a block's view module", /\.view\.[jt]sx?$/],
  ["the fixture's island", /fixture-island\.js$/],
  ["drizzle-orm", /[\\/]node_modules[\\/]drizzle-orm[\\/]/],
];

describe("the editor entry's chunks", () => {
  let eager: readonly string[];
  let viewChunks: readonly OutputChunk[];
  let entryDynamicImports: ReadonlySet<string>;

  beforeAll(async () => {
    // Inside the package, so the fixture's bare imports resolve from its
    // node_modules.
    const cache = join(PACKAGE_DIR, "node_modules", ".cache");
    mkdirSync(cache, { recursive: true });
    const dir = mkdtempSync(join(cache, "editor-chunks-"));
    for (const [file, source] of Object.entries(FIXTURE_FILES)) {
      writeFileSync(join(dir, file), source);
    }

    const result = await build({
      root: dir,
      logLevel: "silent",
      configFile: false,
      plugins: [plumixSourceResolver()],
      // The browser build a site ships: `sanitize-html` maps to the DOMPurify
      // shim, and dev-only code drops out.
      resolve: { mainFields: ["browser", "module", "main"] },
      define: {
        "process.env.NODE_ENV": '"production"',
        "process.env.PLUMIX_DEV": '""',
      },
      build: {
        write: false,
        rollupOptions: {
          input: { "plumix-editor": join(dir, "entry.js") },
        },
      },
    }).finally(() => rmSync(dir, { recursive: true, force: true }));
    const outputs = (
      Array.isArray(result) ? result : [result]
    ) as readonly Rolldown.RolldownOutput[];
    const chunks = outputs.flatMap((o) =>
      o.output.filter((c): c is OutputChunk => c.type === "chunk"),
    );

    const eagerSet = eagerChunks(chunks, "plumix-editor");
    eager = [...eagerSet].flatMap((c) => c.moduleIds);
    viewChunks = chunks.filter((c) =>
      c.moduleIds.some((id) => /\.view\.[jt]sx?$/.test(id)),
    );
    entryDynamicImports = new Set(
      [...eagerSet].flatMap((c) => c.dynamicImports),
    );
  });

  test.each(MUST_STAY_OUT)("loads no %s eagerly", (_, pattern) => {
    expect(eager.filter((id) => pattern.test(id))).toEqual([]);
  });

  test("puts every view module in a chunk the entry imports dynamically", () => {
    expect(viewChunks.length).toBeGreaterThan(0);
    expect(
      viewChunks
        .filter((c) => !entryDynamicImports.has(c.fileName))
        .map((c) => c.moduleIds.filter((id) => id.includes(".view."))),
    ).toEqual([]);
  });
});
