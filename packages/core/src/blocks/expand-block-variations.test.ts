import { describe, expect, test } from "vitest";

import type { BlockSpec } from "./block-registry.js";
import {
  expandBlockVariations,
  resolveVariationPreview,
} from "./expand-block-variations.js";

function block(spec: Partial<BlockSpec> & { name: string }): BlockSpec {
  return { render: () => null, ...spec };
}

describe("expandBlockVariations", () => {
  test("emits one entry per variation when a block declares variations, dropping the parent entry", () => {
    const entries = expandBlockVariations([
      block({
        name: "core/list",
        title: "List",
        icon: "List",
        category: "text",
        variations: [
          {
            slug: "bullet",
            title: "Bulleted list",
            icon: "List",
            attrs: { variant: "bullet" },
          },
          {
            slug: "numbered",
            title: "Numbered list",
            icon: "ListOrdered",
            attrs: { variant: "numbered" },
          },
        ],
      }),
    ]);
    expect(entries.map((e) => e.slug)).toEqual(["bullet", "numbered"]);
    expect(entries.every((e) => e.name === "core/list")).toBe(true);
    expect(entries[0]?.attrs).toEqual({ variant: "bullet" });
    expect(entries[1]?.attrs).toEqual({ variant: "numbered" });
    expect(entries[0]?.icon).toBe("List");
    expect(entries[1]?.icon).toBe("ListOrdered");
    expect(entries.every((e) => e.category === "text")).toBe(true);
  });

  test("emits one entry per registered block when no variations declared", () => {
    const entries = expandBlockVariations([
      block({ name: "core/paragraph", title: "Paragraph" }),
      block({ name: "core/heading", title: "Heading" }),
    ]);
    expect(entries.map((e) => e.name)).toEqual([
      "core/paragraph",
      "core/heading",
    ]);
    expect(entries.map((e) => e.slug)).toEqual([
      "core/paragraph",
      "core/heading",
    ]);
  });

  test("omits variations scoped only to block-picker — the parent block stands in for the inserter card", () => {
    const entries = expandBlockVariations([
      block({
        name: "core/columns",
        title: "Columns",
        variations: [
          {
            slug: "two-up",
            title: "Two up",
            attrs: { layout: "split" },
            scope: ["block"],
          },
          {
            slug: "three-up",
            title: "Three up",
            attrs: { layout: "three" },
            scope: ["block"],
          },
        ],
      }),
    ]);
    expect(entries.map((e) => e.slug)).toEqual(["core/columns"]);
    expect(entries[0]?.name).toBe("core/columns");
  });

  test("respects explicit `scope: ['inserter']` and skips variations with empty scope", () => {
    const entries = expandBlockVariations([
      block({
        name: "core/list",
        title: "List",
        variations: [
          {
            slug: "bullet",
            title: "Bulleted",
            attrs: { variant: "bullet" },
            scope: ["inserter"],
          },
          {
            slug: "hidden",
            title: "Hidden",
            attrs: { variant: "hidden" },
            scope: [],
          },
          {
            slug: "transform-only",
            title: "Transform only",
            // Mirrors a real boot — commitBlockVariations rejects a
            // transform-scope variation without attrs, so the fixture
            // carries one even though this test only exercises expansion.
            attrs: { variant: "transform" },
            scope: ["transform"],
          },
        ],
      }),
    ]);
    expect(entries.map((e) => e.slug)).toEqual(["bullet"]);
  });

  test("carries variation.example through to InsertableBlockEntry.example for preview overrides", () => {
    const entries = expandBlockVariations([
      block({
        name: "core/columns",
        title: "Columns",
        variations: [
          {
            slug: "loader-backed",
            title: "Loader-backed",
            attrs: { dataSrc: "/api/things" },
            example: { attrs: { dataSrc: "static-preview" } },
          },
        ],
      }),
    ]);
    expect(entries[0]?.example?.attrs).toEqual({ dataSrc: "static-preview" });
  });

  test("resolveVariationPreview uses example overrides for preview but leaves entry runtime data untouched", () => {
    const [entry] = expandBlockVariations([
      block({
        name: "core/columns",
        title: "Columns",
        variations: [
          {
            slug: "loader-backed",
            title: "Loader-backed",
            attrs: { dataSrc: "/api/things" },
            example: { attrs: { dataSrc: "static-preview" } },
          },
        ],
      }),
    ]);
    expect(entry?.attrs).toEqual({ dataSrc: "/api/things" });
    if (!entry) throw new Error("expected variation entry");
    expect(resolveVariationPreview(entry).attrs).toEqual({
      dataSrc: "static-preview",
    });
  });

  test("variation entries emit the variation's raw slug, never namespaced under the parent", () => {
    // The admin's `entryKey` helper relies on this — it namespaces by
    // joining `${entry.name}/${entry.slug}`, which would double-prefix
    // if the producer ever emitted `slug = ${name}/${variation.slug}`.
    const entries = expandBlockVariations([
      block({
        name: "core/list",
        title: "List",
        variations: [
          { slug: "bullet", title: "Bulleted", attrs: { variant: "bullet" } },
          {
            slug: "numbered",
            title: "Numbered",
            attrs: { variant: "numbered" },
          },
        ],
      }),
    ]);
    for (const entry of entries) {
      expect(entry.slug.startsWith(`${entry.name}/`)).toBe(false);
    }
    expect(entries.map((e) => e.slug)).toEqual(["bullet", "numbered"]);
  });
});
