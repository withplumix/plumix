import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "./block-registry.js";
import { coreBlocks } from "./core-blocks.js";
import { renderBlockTreeToHtml } from "./test/index.js";

describe("coreBlocks", () => {
  test("includes the canonical typography and layout blocks", () => {
    const names = new Set(coreBlocks.map((b) => b.name));
    expect(names.has("core/rich-text")).toBe(true);
    expect(names.has("core/code")).toBe(true);
    expect(names.has("core/group")).toBe(true);
    expect(names.has("core/columns")).toBe(true);
    expect(names.has("core/table")).toBe(true);
  });

  test("includes video and embed, promoted from the media plugin to core", () => {
    const names = new Set(coreBlocks.map((b) => b.name));
    expect(names.has("core/video")).toBe(true);
    expect(names.has("core/embed")).toBe(true);
  });

  test("core/heading and core/quote collapsed into core/rich-text", () => {
    const names = new Set(coreBlocks.map((b) => b.name));
    expect(names.has("core/heading")).toBe(false);
    expect(names.has("core/quote")).toBe(false);
  });

  test("core/paragraph is no longer registered (collapsed into core/rich-text)", () => {
    expect(coreBlocks.map((b) => b.name)).not.toContain("core/paragraph");
  });

  test("leads the inserter with core/rich-text, the unified Text block", () => {
    expect(coreBlocks.map((b) => b.name)[0]).toBe("core/rich-text");
  });

  test("declares unique block names with no duplicates", () => {
    const names = coreBlocks.map((b) => b.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("layout-category blocks include the migrated wrappers + details", () => {
    const layoutNames = coreBlocks
      .filter((b) => b.category === "layout")
      .map((b) => b.name);
    expect(layoutNames).toEqual(
      expect.arrayContaining(["core/group", "core/columns", "core/details"]),
    );
  });

  test("interactive-category blocks include button", () => {
    const interactiveNames = coreBlocks
      .filter((b) => b.category === "interactive")
      .map((b) => b.name);
    expect(interactiveNames).toEqual(expect.arrayContaining(["core/button"]));
  });

  test("text-category blocks include rich-text and table", () => {
    const textNames = coreBlocks
      .filter((b) => b.category === "text")
      .map((b) => b.name);
    expect(textNames).toEqual(
      expect.arrayContaining(["core/rich-text", "core/table"]),
    );
  });

  test("seeds a BlockRegistry losslessly (size matches input length)", () => {
    const registry = createBlockRegistry(coreBlocks);
    expect(registry.size).toBe(coreBlocks.length);
    for (const spec of coreBlocks) {
      expect(registry.get(spec.name)).toBe(spec);
    }
  });

  test("includes the html block, which no theme or plugin could register", () => {
    const names = new Set(coreBlocks.map((b) => b.name));
    expect(names.has("core/html")).toBe(true);
  });

  // Membership is what decides whether stored content resolves, so assert the
  // consequence rather than only the list: a `core/html` node used to render as
  // an unknown block on every site.
  test("resolves a stored core/html node through the registry", () => {
    const html = renderBlockTreeToHtml(coreBlocks, [
      { id: "h1", name: "core/html", attrs: { html: "<p>Stored</p>" } },
    ]);

    expect(html).toContain("<p>Stored</p>");
  });

  test("declares `inserter: false` on every spec that only makes sense inside a parent", () => {
    const contentOnlyNames = new Set([
      "core/table-header-row",
      "core/table-body-row",
      "core/table-header-cell",
      "core/table-cell",
      "core/pattern-ref",
    ]);

    for (const spec of coreBlocks) {
      if (contentOnlyNames.has(spec.name)) {
        expect(spec.inserter).toBe(false);
      } else {
        expect(spec.inserter).not.toBe(false);
      }
    }

    const hidden = new Set(
      coreBlocks.filter((s) => s.inserter === false).map((s) => s.name),
    );
    expect(hidden).toEqual(contentOnlyNames);
  });

  test("registers core/pattern-ref with a `slug` input declared", () => {
    const ref = coreBlocks.find((b) => b.name === "core/pattern-ref");
    expect(ref).toBeDefined();
    expect(ref?.inserter).toBe(false);
    expect(ref?.inputs?.map((i) => i.name)).toEqual(["slug"]);
  });

  // The reading-length counter's roster is now the blocks' own declarations, so
  // what it reads is no longer visible at its call site. Anything else a core
  // block declares is searchable text the reading estimate must not absorb.
  test("declares exactly four inputs as body copy", () => {
    const bodyCopy = coreBlocks.flatMap((spec) =>
      (spec.text ?? [])
        .filter((input) => input.prose !== false)
        .map((input) => `${spec.name}.${input.name}`),
    );
    expect(bodyCopy.sort()).toEqual([
      "core/details.summary",
      "core/rich-text.body",
      "core/table-cell.text",
      "core/table-header-cell.text",
    ]);
  });

  // A declaration naming an input the block does not have yields no text
  // forever, while still moving the extractor version.
  test("every declared text input names an input the block has", () => {
    for (const spec of coreBlocks) {
      const inputs = new Set((spec.inputs ?? []).map((input) => input.name));
      for (const declared of spec.text ?? []) {
        expect(inputs, `${spec.name}.${declared.name}`).toContain(
          declared.name,
        );
      }
    }
  });
});
