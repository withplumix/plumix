import { describe, expect, test } from "vitest";

import { HookRegistry } from "../../hooks/registry.js";
import {
  getPossibleTemplates,
  resolveTemplateCandidates,
} from "./template-hierarchy.js";

describe("getPossibleTemplates — term nodes", () => {
  test("built-in `category` taxonomy emits the WP category chain", () => {
    expect(
      getPossibleTemplates({
        kind: "term",
        taxonomy: "category",
        slug: "news",
        databaseId: 42,
      }),
    ).toEqual(["category-news", "category-42", "category", "archive", "index"]);
  });

  test("built-in `tag` taxonomy emits the WP tag chain", () => {
    expect(
      getPossibleTemplates({
        kind: "term",
        taxonomy: "tag",
        slug: "javascript",
        databaseId: 7,
      }),
    ).toEqual(["tag-javascript", "tag-7", "tag", "archive", "index"]);
  });

  test("`post` entry type emits single-{type}-{slug} → single-{type} → single → singular → index", () => {
    expect(
      getPossibleTemplates({
        kind: "content",
        entryType: "post",
        slug: "hello-world",
        databaseId: 1,
      }),
    ).toEqual([
      "single-post-hello-world",
      "single-post",
      "single",
      "singular",
      "index",
    ]);
  });

  test("custom entry type (`doc`) falls through `single` like `post`", () => {
    expect(
      getPossibleTemplates({
        kind: "content",
        entryType: "doc",
        slug: "installation",
        databaseId: 12,
      }),
    ).toEqual([
      "single-doc-installation",
      "single-doc",
      "single",
      "singular",
      "index",
    ]);
  });

  test("`page` entry type emits page-{slug} → page-{id} → page → singular → index (no `single`)", () => {
    expect(
      getPossibleTemplates({
        kind: "content",
        entryType: "page",
        slug: "about",
        databaseId: 5,
      }),
    ).toEqual(["page-about", "page-5", "page", "singular", "index"]);
  });

  test("content-type archive emits archive-{type} → archive → index", () => {
    expect(
      getPossibleTemplates({
        kind: "content-type-archive",
        entryType: "product",
      }),
    ).toEqual(["archive-product", "archive", "index"]);
  });

  test("front-page emits front-page → home → index", () => {
    expect(getPossibleTemplates({ kind: "front-page" })).toEqual([
      "front-page",
      "home",
      "index",
    ]);
  });

  test("posts-page (blog home assigned to a page) emits home → index", () => {
    expect(getPossibleTemplates({ kind: "posts-page" })).toEqual([
      "home",
      "index",
    ]);
  });
});

describe("resolveTemplateCandidates — `template:hierarchy` filter", () => {
  test("filter can prepend new candidates ahead of the WP chain", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("template:hierarchy", (candidates, ctx) => {
      if (ctx.node.kind !== "content") return candidates;
      return [`single-${ctx.node.entryType}-by-author`, ...candidates];
    });

    const result = await resolveTemplateCandidates(
      {
        kind: "content",
        entryType: "post",
        slug: "hello",
        databaseId: 1,
      },
      hooks,
    );

    expect(result[0]).toBe("single-post-by-author");
    expect(result).toContain("index");
  });

  test("filter can drop candidates from the list", async () => {
    const hooks = new HookRegistry();
    hooks.addFilter("template:hierarchy", (candidates) =>
      candidates.filter((c) => c !== "archive"),
    );

    const result = await resolveTemplateCandidates(
      { kind: "term", taxonomy: "category", slug: "news", databaseId: 1 },
      hooks,
    );

    expect(result).not.toContain("archive");
    expect(result).toContain("category");
  });

  test("with no registered filter the result equals the pure walker output", async () => {
    const hooks = new HookRegistry();
    const node = {
      kind: "term" as const,
      taxonomy: "tag",
      slug: "x",
      databaseId: 1,
    };
    expect(await resolveTemplateCandidates(node, hooks)).toEqual(
      getPossibleTemplates(node),
    );
  });

  test("custom taxonomy emits the generic taxonomy-{tax} chain", () => {
    expect(
      getPossibleTemplates({
        kind: "term",
        taxonomy: "region",
        slug: "europe",
        databaseId: 3,
      }),
    ).toEqual([
      "taxonomy-region-europe",
      "taxonomy-region-3",
      "taxonomy-region",
      "taxonomy",
      "archive",
      "index",
    ]);
  });
});
