import { describe, expect, test } from "vitest";

import type { BlockSpec } from "@plumix/blocks";
import { createBlockRegistry } from "@plumix/blocks";

import {
  nextInsertPoint,
  PUCK_ROOT_ZONE,
  resolveSlashMenuItems,
} from "./slash-menu-items.js";

function spec(partial: Partial<BlockSpec> & { name: string }): BlockSpec {
  return { render: () => null, ...partial };
}

describe("resolveSlashMenuItems", () => {
  test("wraps each block in a discriminated `{ kind: 'block', entry }` shape", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", title: "Heading" }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
    });

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("block");
    expect(items[0]?.entry.name).toBe("core/heading");
  });

  test("projects every block in the registry into a SlashMenuItem", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", title: "Heading", category: "typography" }),
      spec({ name: "core/columns", title: "Columns", category: "layout" }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
    });

    expect(items.map((i) => i.entry.name).sort()).toEqual([
      "core/columns",
      "core/heading",
    ]);
    expect(
      items.find((i) => i.entry.name === "core/columns")?.entry.category,
    ).toBe("layout");
  });

  test("matches a descriptor title via its source-locale message", () => {
    // Slash-menu search keys on `labelSourceText(entry.title)` so plugin
    // authors can pass `MessageDescriptor` titles without breaking the
    // matcher. Search stays locale-stable regardless of UI locale.
    const registry = createBlockRegistry([
      spec({
        name: "acme/hero",
        title: { id: "block.acme.hero.title", message: "Hero banner" },
      }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "hero",
    });

    expect(items.map((i) => i.entry.name)).toEqual(["acme/hero"]);
  });

  test("matches blocks by title (substring) and name (substring), case-insensitive", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", title: "Heading" }),
      spec({ name: "core/paragraph", title: "Paragraph" }),
    ]);

    const byTitle = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "HEAD",
    });
    expect(byTitle.map((i) => i.entry.name)).toEqual(["core/heading"]);

    const byName = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "paragraph",
    });
    expect(byName.map((i) => i.entry.name)).toEqual(["core/paragraph"]);
  });

  test("matches keywords by prefix (alias semantics), not substring", () => {
    const registry = createBlockRegistry([
      spec({
        name: "x/pull",
        title: "Pull",
        keywords: ["blockquote"],
      }),
    ]);

    const prefixMatch = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "block",
    });
    expect(prefixMatch.map((i) => i.entry.name)).toEqual(["x/pull"]);

    const substringNonMatch = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "quote",
    });
    expect(substringNonMatch.map((i) => i.entry.name)).toEqual([]);
  });

  test("omits blocks whose `capability` is not present in the viewer's capability set", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", title: "Heading" }),
      spec({ name: "core/html", title: "HTML", capability: "edit_html" }),
    ]);

    const restricted = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
    });
    expect(restricted.map((i) => i.entry.name)).toEqual(["core/heading"]);

    const elevated = resolveSlashMenuItems(registry, {
      capabilities: new Set(["edit_html"]),
      query: "",
    });
    expect(elevated.map((i) => i.entry.name).sort()).toEqual([
      "core/heading",
      "core/html",
    ]);
  });

  test("ranks title matches above keyword matches above name-only matches", () => {
    const registry = createBlockRegistry([
      spec({ name: "z/title", title: "Quote Title" }),
      spec({ name: "z/keyword", title: "Pull", keywords: ["quote"] }),
      spec({ name: "core/quote", title: "Pull" }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "quote",
    });

    expect(items.map((i) => i.entry.name)).toEqual([
      "z/title",
      "z/keyword",
      "core/quote",
    ]);
  });

  test("returns the title verbatim and falls back to the block name when title is undefined", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/spacer" }),
      spec({ name: "core/heading", title: "Heading" }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
    });

    expect(items.find((i) => i.entry.name === "core/spacer")?.entry.title).toBe(
      "core/spacer",
    );
    expect(
      items.find((i) => i.entry.name === "core/heading")?.entry.title,
    ).toBe("Heading");
  });

  test("omits specs declared with `inserter: false` so structural-children stay out of the menu", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/table", title: "Table" }),
      spec({
        name: "core/table-row",
        title: "Table row",
        inserter: false,
      }),
      spec({
        name: "core/table-cell",
        title: "Table cell",
        inserter: false,
      }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
    });

    expect(items.map((i) => i.entry.name)).toEqual(["core/table"]);
  });

  test("keeps specs that omit `inserter` (default shown) and specs that opt in with `inserter: true`", () => {
    const registry = createBlockRegistry([
      spec({ name: "a/default", title: "Default" }),
      spec({ name: "a/opt-in", title: "Opt-in", inserter: true }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
    });

    expect(items.map((i) => i.entry.name).sort()).toEqual([
      "a/default",
      "a/opt-in",
    ]);
  });

  test("emits one item per variation when a block declares variations, slugs distinguish them", () => {
    const registry = createBlockRegistry([
      spec({
        name: "core/list",
        title: "List",
        category: "text",
        variations: [
          {
            slug: "bullet",
            title: "Bulleted list",
            attrs: { variant: "bullet" },
          },
          {
            slug: "numbered",
            title: "Numbered list",
            attrs: { variant: "numbered" },
          },
        ],
      }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
    });

    const blockEntries = items.flatMap((i) =>
      i.kind === "block" ? [i.entry] : [],
    );
    expect(blockEntries.map((e) => e.slug)).toEqual(["bullet", "numbered"]);
    expect(blockEntries.map((e) => e.title)).toEqual([
      "Bulleted list",
      "Numbered list",
    ]);
    expect(blockEntries.every((e) => e.name === "core/list")).toBe(true);
    expect(blockEntries[0]?.attrs).toEqual({ variant: "bullet" });
    expect(blockEntries[1]?.attrs).toEqual({ variant: "numbered" });
  });

  test("interleaves pattern entries from the patterns option as `{ kind: 'pattern', entry }`", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", title: "Heading" }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "",
      patterns: [
        {
          name: "starter/hero",
          title: "Hero",
          category: "hero",
          content: [],
        },
        {
          name: "starter/cta",
          title: "Call to action",
          category: "cta",
          content: [],
        },
      ],
    });

    const patterns = items.filter((i) => i.kind === "pattern");
    expect(patterns.map((i) => i.entry.name).sort()).toEqual([
      "starter/cta",
      "starter/hero",
    ]);
    expect(items.some((i) => i.kind === "block")).toBe(true);
  });

  test("matches pattern entries by title, name, category, and keywords", () => {
    const registry = createBlockRegistry([]);

    const matches = (query: string, expected: string[]): void => {
      const items = resolveSlashMenuItems(registry, {
        capabilities: new Set(),
        query,
        patterns: [
          {
            name: "starter/hero-cta",
            title: "Hero with CTA",
            category: "hero",
            keywords: ["landing"],
            content: [],
          },
          {
            name: "starter/footer",
            title: "Footer",
            category: "footer",
            content: [],
          },
        ],
      });
      expect(items.map((i) => i.entry.name).sort()).toEqual(expected.sort());
    };

    matches("hero", ["starter/hero-cta"]);
    matches("footer", ["starter/footer"]);
    matches("landing", ["starter/hero-cta"]);
    matches("starter/footer", ["starter/footer"]);
  });

  test("matches a pattern by category prefix when title/name/keywords don't carry the token", () => {
    const registry = createBlockRegistry([]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "head",
      patterns: [
        {
          name: "starter/site-top",
          title: "Site top",
          category: "header",
          content: [],
        },
      ],
    });

    expect(items.map((i) => i.entry.name)).toEqual(["starter/site-top"]);
  });

  test("treats whitespace-only queries as empty (no filtering)", () => {
    const registry = createBlockRegistry([
      spec({ name: "core/heading", title: "Heading" }),
      spec({ name: "core/quote", title: "Quote" }),
    ]);

    const items = resolveSlashMenuItems(registry, {
      capabilities: new Set(),
      query: "   ",
    });

    expect(items).toHaveLength(2);
  });
});

describe("nextInsertPoint", () => {
  test("returns root zone + end-of-content when no item is selected", () => {
    expect(nextInsertPoint(null, 4)).toEqual({
      zone: PUCK_ROOT_ZONE,
      index: 4,
    });
    expect(nextInsertPoint(undefined, 0)).toEqual({
      zone: PUCK_ROOT_ZONE,
      index: 0,
    });
  });

  test("inserts immediately after a selected top-level block in the root zone", () => {
    expect(nextInsertPoint({ zone: PUCK_ROOT_ZONE, index: 2 }, 5)).toEqual({
      zone: PUCK_ROOT_ZONE,
      index: 3,
    });
  });

  test("inserts immediately after a selected block inside a nested zone", () => {
    expect(nextInsertPoint({ zone: "section-abc:left", index: 0 }, 5)).toEqual({
      zone: "section-abc:left",
      index: 1,
    });
  });

  test("falls back to root zone when a selector lacks zone metadata", () => {
    expect(nextInsertPoint({ index: 1 }, 5)).toEqual({
      zone: PUCK_ROOT_ZONE,
      index: 2,
    });
  });
});
