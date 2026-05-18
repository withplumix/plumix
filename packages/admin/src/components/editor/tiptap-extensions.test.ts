import { Mark } from "@tiptap/core";
import { describe, expect, test } from "vitest";

import type { MarkRegistry, ResolvedMarkSpec } from "@plumix/blocks";

import { buildTiptapExtensions } from "./tiptap-extensions.js";

function fakeMarkRegistry(specs: readonly ResolvedMarkSpec[]): MarkRegistry {
  const map = new Map(specs.map((s) => [s.name, s]));
  return {
    get: (n) => map.get(n),
    has: (n) => map.has(n),
    size: map.size,
    [Symbol.iterator]: () => map.entries(),
  } satisfies MarkRegistry;
}

function pluginMarkSpec(
  name: string,
  registeredBy: string | null,
): ResolvedMarkSpec {
  const spec: Partial<ResolvedMarkSpec> = {
    name,
    title: name,
    schema: Mark.create({ name }),
    component: () => null,
    registeredBy,
  };
  return spec as ResolvedMarkSpec;
}

describe("buildTiptapExtensions — markRegistry", () => {
  test("appends a Tiptap mark extension for each plugin-registered mark", () => {
    const registry = fakeMarkRegistry([
      pluginMarkSpec("acme/highlight-warning", "acme"),
    ]);
    const exts = buildTiptapExtensions({ markRegistry: registry });
    expect(
      exts.some(
        (ext) => (ext as { name?: string }).name === "acme/highlight-warning",
      ),
    ).toBe(true);
  });

  test("loads every registered mark — core + plugin — so the registry is the source of truth", () => {
    const registry = fakeMarkRegistry([
      pluginMarkSpec("bold", null),
      pluginMarkSpec("acme/highlight-warning", "acme"),
    ]);
    const exts = buildTiptapExtensions({ markRegistry: registry });
    const names = exts.map((ext) => (ext as { name?: string }).name);
    expect(names).toContain("bold");
    expect(names).toContain("acme/highlight-warning");
  });

  test("emits no plugin marks when registry is omitted", () => {
    const exts = buildTiptapExtensions({});
    const names = exts.map((ext) => (ext as { name?: string }).name);
    expect(names).not.toContain("acme/highlight-warning");
  });
});
