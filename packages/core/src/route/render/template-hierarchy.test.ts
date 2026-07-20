import { describe, expect, expectTypeOf, test } from "vitest";

import type { TemplateData } from "../../theme.js";
import type {
  ArchiveData,
  EntryData,
  ResolvedEntry,
  ResolvedTerm,
  TaxonomyData,
} from "./resolved-entry.js";
import type { ResolvedNode } from "./template-hierarchy.js";
import {
  archive,
  entry,
  fallback,
  forEntryType,
  forTaxonomy,
  frontPage,
  NAMED_TEMPLATE_META_KEY,
  notFound,
  postsPage,
  search,
  serverError,
  taxonomy,
} from "./template-builders.js";
import { resolveErrorTemplate, resolveTemplate } from "./template-hierarchy.js";

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
    product: { entry: Product; meta: { onSale: boolean } };
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

  test("whereMeta types keys and values against the meta projection", () => {
    forEntryType("product")
      .whereMeta("onSale", true)
      .template(() => null);
    // @ts-expect-error - "nope" is not a meta key of product
    forEntryType("product").whereMeta("nope", true);
    // @ts-expect-error - onSale is a boolean, not a string
    forEntryType("product").whereMeta("onSale", "yes");
  });
});

describe("resolveTemplate — predicate rules (whereMeta / where / named)", () => {
  const postNode: ResolvedNode = {
    kind: "content",
    entryType: "post",
    slug: "hello",
    databaseId: 1,
  };
  const entryData = (meta: Record<string, unknown>): TemplateData =>
    ({ kind: "entry", entry: { meta } }) as unknown as TemplateData;

  test("whereMeta matches when the entry-meta value equals; else falls through", () => {
    const rules = [
      forEntryType("post")
        .whereMeta("featured", true)
        .template(() => null),
      entry(() => null),
    ];
    expect(
      resolveTemplate(rules, postNode, entryData({ featured: true }))?.match,
    ).toBeDefined();
    expect(
      resolveTemplate(rules, postNode, entryData({ featured: false }))?.tier,
    ).toBe("entry");
  });

  test("where evaluates an arbitrary predicate over the resolved data", () => {
    const rules = [
      forEntryType("post")
        .where((data) => data.entry.meta.premium === 1)
        .template(() => null),
      entry(() => null),
    ];
    expect(
      resolveTemplate(rules, postNode, entryData({ premium: 1 }))?.match,
    ).toBeDefined();
    expect(
      resolveTemplate(rules, postNode, entryData({ premium: 0 }))?.tier,
    ).toBe("entry");
  });

  test("named matches the stored template choice and carries its label", () => {
    const rule = forEntryType("page")
      .named("landing", "Landing Page")
      .template(() => null);
    expect(rule.match?.named).toEqual({ id: "landing", label: "Landing Page" });
    const pageNode: ResolvedNode = {
      kind: "content",
      entryType: "page",
      slug: "home",
      databaseId: 1,
    };
    expect(
      resolveTemplate(
        [rule],
        pageNode,
        entryData({ [NAMED_TEMPLATE_META_KEY]: "landing" }),
      ),
    ).toBe(rule);
    expect(resolveTemplate([rule], pageNode, entryData({}))).toBeUndefined();
  });

  test("a predicate rule never matches when data is absent", () => {
    const rules = [
      forEntryType("post")
        .whereMeta("featured", true)
        .template(() => null),
      entry(() => null),
    ];
    expect(resolveTemplate(rules, postNode)?.tier).toBe("entry");
  });
});
