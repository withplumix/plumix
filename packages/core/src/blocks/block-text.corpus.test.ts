import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import type { BlockTextRoster } from "./block-text.js";
import type { BlockNode } from "./render-block-tree.js";
import { blockTextRoster, extractBlockText } from "./block-text.js";
import { coreBlocks } from "./core-blocks.js";
import { countProse } from "./count-prose.js";

// The demo site's seeded content — 40-odd published entries of real prose,
// nested tables, a code listing and images. Synthetic fixtures prove the walk
// handles a shape; this proves it handles what the product actually stores.
// Resolved from the package root vitest runs in, not `import.meta.url` — the
// transform rewrites that to a dev-server URL, which `readFileSync` refuses.
const SEED_SQL = readFileSync(
  resolve(process.cwd(), "../../apps/demo/seed.sql"),
  "utf8",
);

// Split one `VALUES (…)` tuple on its top-level commas. SQL string literals
// escape a quote by doubling it, so quote state is all the scanner tracks.
function splitSqlValues(tuple: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < tuple.length; i += 1) {
    const char = tuple[i];
    if (quoted) {
      if (char === "'") {
        if (tuple[i + 1] === "'") {
          current += "'";
          i += 1;
        } else quoted = false;
      } else current += char;
      continue;
    }
    if (char === "'") quoted = true;
    else if (char === ",") {
      values.push(current.trim());
      current = "";
    } else current += char;
  }
  values.push(current.trim());
  return values;
}

interface SeededEntry {
  readonly title: string;
  readonly blocks: readonly BlockNode[];
}

function seededEntries(): readonly SeededEntry[] {
  const entries: SeededEntry[] = [];
  for (const line of SEED_SQL.split("\n")) {
    if (!line.startsWith("INSERT INTO entries (")) continue;
    const columns = line
      .slice(line.indexOf("(") + 1, line.indexOf(")"))
      .split(",")
      .map((name) => name.trim());
    const start = line.indexOf("VALUES (") + "VALUES (".length;
    const values = splitSqlValues(line.slice(start, line.lastIndexOf(")")));
    const raw = values[columns.indexOf("content")] ?? "";
    if (raw === "" || raw === "NULL") continue;
    // Menu-item entries seed a literal `null` content column.
    const content = JSON.parse(raw) as { readonly blocks?: BlockNode[] } | null;
    if (!content?.blocks) continue;
    entries.push({
      title: values[columns.indexOf("title")] ?? "",
      blocks: content.blocks,
    });
  }
  return entries;
}

const CORPUS = seededEntries();
const roster = blockTextRoster(coreBlocks);

// What the reading-length counter read before blocks declared their own text:
// four block names, one input each, hardcoded in the counter.
const LEGACY_ROSTER: BlockTextRoster = new Map([
  ["core/rich-text", [{ name: "body", html: true }]],
  ["core/details", [{ name: "summary" }]],
  ["core/table-header-cell", [{ name: "text" }]],
  ["core/table-cell", [{ name: "text" }]],
]);

// The typography showcase post: the one entry exercising every styled element.
const showcaseBlocks =
  CORPUS.find((entry) => entry.title.startsWith("Typography & Elements"))
    ?.blocks ?? [];

describe("block text over the demo corpus", () => {
  test("the seed parses into a corpus worth asserting against", () => {
    expect(CORPUS.length).toBeGreaterThan(20);
  });

  // The seeded bodies carry no escaped markup, so a surviving `<tag>` means the
  // strip missed it. An entry that ever writes `&lt;div&gt;` in prose would
  // decode to a real `<div>` here by design, and this would need narrowing.
  test("every entry yields text, and none of it is markup", () => {
    for (const entry of CORPUS) {
      const text = extractBlockText(entry.blocks, roster);
      expect(text.length, entry.title).toBeGreaterThan(0);
      expect(text, entry.title).not.toMatch(/<[a-z][^<>]*>/i);
    }
  });

  test("reaches a table cell nested two slots deep", () => {
    expect(showcaseBlocks.length).toBeGreaterThan(0);
    // `core/table` → `core/table-body-row` → `core/table-cell`.
    expect(extractBlockText(showcaseBlocks, roster)).toContain(
      "Light, tiles, trams",
    );
  });

  test("indexes the code listing the reading-length count skips", () => {
    expect(extractBlockText(showcaseBlocks, roster)).toContain(
      "export function greet",
    );
  });

  // Not a golden: both sides run the same walk, so this pins the roster rather
  // than the extraction. The counted output itself is pinned by the unit suite.
  test("the declared roster counts what the hardcoded four did", () => {
    for (const entry of CORPUS) {
      expect(countProse(entry.blocks, roster), entry.title).toEqual(
        countProse(entry.blocks, LEGACY_ROSTER),
      );
    }
  });
});
