import { describe, expect, test } from "vitest";

import { createBlockRegistry } from "@plumix/core/blocks";

import { mergeDeps, unresolvedDeps } from "./block-deps.js";

/**
 * A plain spec, not `defineBlock`: this package's program loads no site's dep
 * kinds for `defineBlock` to check a declaration against.
 */
const registry = createBlockRegistry([
  {
    name: "acme/copy",
    deps: (attrs) => ({ settings: [String(attrs.group)] }),
    render: () => null,
  },
]);

const copy = (id: string, group: string) => ({
  id,
  name: "acme/copy",
  attrs: { group },
});

describe("unresolvedDeps", () => {
  test("is false while every declared key is already held", () => {
    expect(
      unresolvedDeps([copy("a", "school_ks2")], registry, {
        settings: { school_ks2: { title: "KS2" } },
      }),
    ).toBe(false);
  });

  test("is true once an attribute change declares a key not yet held", () => {
    expect(
      unresolvedDeps([copy("a", "school_ks3")], registry, {
        settings: { school_ks2: { title: "KS2" } },
      }),
    ).toBe(true);
  });

  test("counts a key the loader resolved to null as held", () => {
    expect(
      unresolvedDeps([copy("a", "unsaved")], registry, {
        settings: { unsaved: null },
      }),
    ).toBe(false);
  });
});

describe("mergeDeps", () => {
  test("adds the resolved keys and keeps the ones already held", () => {
    expect(
      mergeDeps(
        { settings: { school_ks2: { title: "KS2" } } },
        { settings: { school_ks3: { title: "KS3" } }, menus: { footer: [] } },
      ),
    ).toEqual({
      settings: {
        school_ks2: { title: "KS2" },
        school_ks3: { title: "KS3" },
      },
      menus: { footer: [] },
    });
  });
});
