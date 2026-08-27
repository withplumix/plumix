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

describe("RouteCompileError.invalidRewriteSlug", () => {
  test("class identity, code, and exposed registration + slug", () => {
    const err = RouteCompileError.invalidRewriteSlug({
      registration: "entry_type",
      registrationName: "product",
      rewriteSlug: "*",
    });
    expect(err).toBeInstanceOf(RouteCompileError);
    expect(err.name).toBe("RouteCompileError");
    expect(err.code).toBe("invalid_rewrite_slug");
    expect(err.registration).toBe("entry_type");
    expect(err.registrationName).toBe("product");
    expect(err.rewriteSlug).toBe("*");
  });

  test("entry-type message names the type, the slug, and the root exception", () => {
    const err = RouteCompileError.invalidRewriteSlug({
      registration: "entry_type",
      registrationName: "product",
      rewriteSlug: "shop/all",
    });
    expect(err.message).toContain('Entry type "product"');
    expect(err.message).toContain('invalid rewrite.slug "shop/all"');
    expect(err.message).toContain("single lowercase kebab-case path segment");
    expect(err.message).toContain('(or "" to claim the site root)');
  });

  test("taxonomy message names the taxonomy and omits the root exception", () => {
    const err = RouteCompileError.invalidRewriteSlug({
      registration: "term_taxonomy",
      registrationName: "topic",
      rewriteSlug: "",
    });
    expect(err.message).toContain('Term taxonomy "topic"');
    expect(err.message).toContain('invalid rewrite.slug ""');
    expect(err.message).not.toContain("site root");
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
