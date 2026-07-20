import { describe, expect, expectTypeOf, test } from "vitest";

import type {
  ArchiveData,
  EntryData,
  ResolvedEntry,
  ResolvedTerm,
  TaxonomyData,
} from "./resolved-entry.js";
import type { ResolvedNode } from "./template-hierarchy.js";
import { HookRegistry } from "../../hooks/registry.js";
import {
  archive,
  entry,
  fallback,
  forEntryType,
  forTaxonomy,
  frontPage,
  notFound,
  postsPage,
  search,
  serverError,
  taxonomy,
} from "./template-builders.js";
import {
  getPossibleTemplates,
  resolveErrorTemplate,
  resolveTemplate,
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

const contentNode: ResolvedNode = {
  kind: "content",
  entryType: "post",
  slug: "x",
  databaseId: 1,
};

describe("resolveTemplate — generic tiers", () => {
  const rules = [
    entry(() => null),
    archive(() => null),
    taxonomy(() => null),
    frontPage(() => null),
    postsPage(() => null),
    search(() => null),
    fallback(() => null),
  ];

  test.each<[ResolvedNode, string]>([
    [contentNode, "entry"],
    [{ kind: "content-type-archive", entryType: "post" }, "archive"],
    [
      { kind: "term", taxonomy: "category", slug: "x", databaseId: 1 },
      "taxonomy",
    ],
    [{ kind: "front-page" }, "frontPage"],
    [{ kind: "posts-page" }, "postsPage"],
    [{ kind: "search" }, "search"],
  ])("resolves a node to its matching generic tier (#%#)", (node, tier) => {
    expect(resolveTemplate(rules, node)?.tier).toBe(tier);
  });

  test("array order is cosmetic — the node's own tier wins over fallback", () => {
    // `fallback` is declared last but a content node still resolves to `entry`.
    expect(resolveTemplate(rules, contentNode)?.tier).toBe("entry");
  });

  test("falls back to `fallback` when the node's tier is absent", () => {
    expect(resolveTemplate([fallback(() => null)], contentNode)?.tier).toBe(
      "fallback",
    );
  });

  test("returns undefined when neither the tier nor fallback is present", () => {
    expect(resolveTemplate([archive(() => null)], contentNode)).toBeUndefined();
  });
});

describe("resolveErrorTemplate", () => {
  const rules = [notFound(() => null), serverError(() => null)];

  test("finds the notFound (404) tier", () => {
    expect(resolveErrorTemplate(rules, "notFound")?.tier).toBe("notFound");
  });

  test("finds the serverError (500) tier", () => {
    expect(resolveErrorTemplate(rules, "serverError")?.tier).toBe(
      "serverError",
    );
  });

  test("returns undefined when the error tier is absent", () => {
    expect(resolveErrorTemplate([], "notFound")).toBeUndefined();
  });
});

describe("generic-tier builders — data typing", () => {
  test("each builder types its template's data to the tier's shape", () => {
    entry(({ data }) => {
      expectTypeOf(data).toEqualTypeOf<EntryData>();
      return null;
    });
    archive(({ data }) => {
      expectTypeOf(data).toEqualTypeOf<ArchiveData>();
      return null;
    });
    taxonomy(({ data }) => {
      expectTypeOf(data).toEqualTypeOf<TaxonomyData>();
      return null;
    });
  });
});

interface Product extends ResolvedEntry {
  readonly price: number;
}
interface Brand extends ResolvedTerm {
  readonly logoUrl: string | null;
}
declare module "../../template-registry.js" {
  interface EntryTypeRegistry {
    product: { entry: Product };
  }
  interface TaxonomyRegistry {
    brand: { term: Brand };
  }
}

describe("resolveTemplate — targeted rules (Zone 1)", () => {
  const postNode: ResolvedNode = {
    kind: "content",
    entryType: "post",
    slug: "hello",
    databaseId: 42,
  };
  const postArchive: ResolvedNode = {
    kind: "content-type-archive",
    entryType: "post",
  };
  const catTerm: ResolvedNode = {
    kind: "term",
    taxonomy: "category",
    slug: "news",
    databaseId: 7,
  };

  test("a targeted type rule matches its content node and beats the generic tier", () => {
    const rules = [
      entry(() => null),
      forEntryType("post").template(() => null),
    ];
    expect(resolveTemplate(rules, postNode)?.match?.type).toBe("post");
  });

  test(".slug narrows to one entry; a different slug falls through to the tier", () => {
    const rules = [
      forEntryType("post")
        .slug("hello")
        .template(() => null),
      entry(() => null),
    ];
    expect(resolveTemplate(rules, postNode)?.match?.slug).toBe("hello");
    expect(resolveTemplate(rules, { ...postNode, slug: "world" })?.tier).toBe(
      "entry",
    );
  });

  test(".id narrows by databaseId", () => {
    const rules = [
      forEntryType("post")
        .id(42)
        .template(() => null),
      entry(() => null),
    ];
    expect(resolveTemplate(rules, postNode)?.match?.id).toBe(42);
    expect(resolveTemplate(rules, { ...postNode, databaseId: 99 })?.tier).toBe(
      "entry",
    );
  });

  test(".archive matches the content-type-archive node, not a content node", () => {
    const rules = [forEntryType("post").archive.template(() => null)];
    expect(resolveTemplate(rules, postArchive)?.match?.nodeKind).toBe(
      "content-type-archive",
    );
    expect(resolveTemplate(rules, postNode)).toBeUndefined();
  });

  test("forTaxonomy matches a term node; .slug narrows the term", () => {
    const rules = [
      forTaxonomy("category")
        .slug("news")
        .template(() => null),
      taxonomy(() => null),
    ];
    expect(resolveTemplate(rules, catTerm)?.match?.slug).toBe("news");
    expect(resolveTemplate(rules, { ...catTerm, slug: "sports" })?.tier).toBe(
      "taxonomy",
    );
  });

  test("first matching targeted rule wins (declaration order)", () => {
    const broad = forEntryType("post").template(() => null);
    const specific = forEntryType("post")
      .slug("hello")
      .template(() => null);
    // Broad, declared first, shadows the specific one; reversed, specific wins.
    expect(resolveTemplate([broad, specific], postNode)).toBe(broad);
    expect(resolveTemplate([specific, broad], postNode)).toBe(specific);
  });
});

describe("targeted builders — name checking and data typing", () => {
  test("forEntryType types data.entry from the registry projection", () => {
    forEntryType("post").template(({ data }) => {
      expectTypeOf(data.entry).toEqualTypeOf<ResolvedEntry>();
      return null;
    });
    forEntryType("product").template(({ data }) => {
      expectTypeOf(data.entry).toEqualTypeOf<Product>();
      return null;
    });
    forEntryType("product").archive.template(({ data }) => {
      expectTypeOf(data.entries).toEqualTypeOf<readonly Product[]>();
      return null;
    });
  });

  test("forTaxonomy types data.term from the registry projection", () => {
    forTaxonomy("category").template(({ data }) => {
      expectTypeOf(data.term).toEqualTypeOf<ResolvedTerm>();
      return null;
    });
    forTaxonomy("brand")
      .slug("acme")
      .template(({ data }) => {
        expectTypeOf(data.term).toEqualTypeOf<Brand>();
        return null;
      });
  });

  test("unregistered names are compile errors", () => {
    // @ts-expect-error - not a registered entry type
    forEntryType("nope");
    // @ts-expect-error - not a registered taxonomy
    forTaxonomy("nope");
  });
});
