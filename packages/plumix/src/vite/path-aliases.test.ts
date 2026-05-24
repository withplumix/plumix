import { describe, expect, test } from "vitest";

import { plumixPathAliases } from "./path-aliases.js";

describe("plumixPathAliases", () => {
  test('maps "~/" to the project root with a trailing slash', () => {
    // Nuxt convention — `~/foo` becomes `<root>/foo`. Theme CSS,
    // component imports, image references all flow through this.
    const aliases = plumixPathAliases("/Users/example/my-app");
    expect(aliases).toContainEqual({
      find: "~/",
      replacement: "/Users/example/my-app/",
    });
  });

  test('maps "@/" to the project root (Vue / Vite community convention)', () => {
    const aliases = plumixPathAliases("/root");
    expect(aliases).toContainEqual({
      find: "@/",
      replacement: "/root/",
    });
  });

  test("does not register bare `~` or `@` (would shadow scoped packages)", () => {
    // A bare `@` alias would intercept `@plumix/core` and other
    // scoped-package specifiers before node-modules resolution; a
    // bare `~` would intercept `~plumix-anything`. Only the
    // slash-terminated forms are safe.
    const aliases = plumixPathAliases("/root");
    expect(aliases.find((a) => a.find === "~")).toBeUndefined();
    expect(aliases.find((a) => a.find === "@")).toBeUndefined();
  });
});
