import { describe, expect, test } from "vitest";

import { RouteCompileError } from "./errors.js";

describe("RouteCompileError.invalidArchiveSlug", () => {
  test("class identity, code, and exposed entryType + hasArchive", () => {
    const err = RouteCompileError.invalidArchiveSlug({
      entryType: "post",
      hasArchive: "Bad Slug",
    });
    expect(err).toBeInstanceOf(RouteCompileError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("RouteCompileError");
    expect(err.code).toBe("invalid_archive_slug");
    expect(err.entryType).toBe("post");
    expect(err.hasArchive).toBe("Bad Slug");
  });

  test("message names the entry type, the bad slug, and the expected shape", () => {
    const err = RouteCompileError.invalidArchiveSlug({
      entryType: "post",
      hasArchive: "Bad Slug",
    });
    expect(err.message).toContain('Entry type "post"');
    expect(err.message).toContain('invalid hasArchive "Bad Slug"');
    expect(err.message).toContain("single lowercase kebab-case path segment");
  });
});

describe("RouteCompileError.duplicateRewriteRule", () => {
  test("class identity, code, and exposed pattern + owners", () => {
    const err = RouteCompileError.duplicateRewriteRule({
      rawPattern: "/cart",
      firstOwner: "a",
      secondOwner: "b",
    });
    expect(err).toBeInstanceOf(RouteCompileError);
    expect(err.name).toBe("RouteCompileError");
    expect(err.code).toBe("duplicate_rewrite_rule");
    expect(err.rawPattern).toBe("/cart");
    expect(err.firstOwner).toBe("a");
    expect(err.secondOwner).toBe("b");
  });

  test('message names the pattern and both plugin owners as `plugin "X"`', () => {
    const err = RouteCompileError.duplicateRewriteRule({
      rawPattern: "/cart",
      firstOwner: "a",
      secondOwner: "a",
    });
    expect(err.message).toContain('Rewrite rule "/cart" is registered twice');
    expect(err.message).toContain('plugin "a"');
  });

  test("null owners are formatted as `core`", () => {
    const err = RouteCompileError.duplicateRewriteRule({
      rawPattern: "/p/:slug",
      firstOwner: null,
      secondOwner: "plugin-a",
    });
    expect(err.message).toContain("by core");
    expect(err.message).toContain('plugin "plugin-a"');
  });
});
