import { describe, expect, expectTypeOf, test } from "vitest";

import type { TemplateData } from "../../theme.js";
import type {
  ArchiveData,
  AuthorArchiveData,
  CustomArchiveData,
  DateArchiveData,
  EntryData,
  ResolvedEntry,
  ResolvedTerm,
  TaxonomyData,
} from "./resolved-entry.js";
import type { ResolvedNode } from "./template-hierarchy.js";
import { text } from "../../plugin/fields/builder.js";
import {
  archive,
  author,
  collectNamedTemplates,
  date,
  entry,
  fallback,
  forArchiveType,
  forAuthor,
  forDate,
  forEntryType,
  forTermTaxonomy,
  frontPage,
  NAMED_TEMPLATE_META_KEY,
  notFound,
  search,
  serverError,
  taxonomy,
} from "./template-builders.js";
import {
  explainTemplateResolution,
  resolveErrorTemplate,
  resolveTemplate,
  ruleLabel,
} from "./template-hierarchy.js";

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
    author(() => null),
    date(() => null),
    frontPage(() => null),
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
    [{ kind: "author", slug: "jane", databaseId: 1 }, "author"],
    [{ kind: "date", year: 2026, month: 7, day: 21 }, "date"],
    [{ kind: "front-page" }, "frontPage"],
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
    author(({ data }) => {
      expectTypeOf(data).toEqualTypeOf<AuthorArchiveData>();
      return null;
    });
    date(({ data }) => {
      expectTypeOf(data).toEqualTypeOf<DateArchiveData>();
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
interface GalleryData extends CustomArchiveData {
  readonly kind: "custom";
  readonly name: "gallery";
  readonly album: string;
}
declare module "../../template-registry.js" {
  interface EntryTypeRegistry {
    product: { entry: Product };
  }
  interface TermTaxonomyRegistry {
    brand: { term: Brand };
  }
  interface ArchiveTypeRegistry {
    gallery: { data: GalleryData };
  }
}

// Meta contribution fixtures: typed reads come from the contribution
// registries, folded per target by `MetaOf` / `TermMetaOf`.
const _productFields = [text("badge").default("none"), text("tier").required()];
const _editorialFields = [text("featured"), text("premium")];
const _brandFields = [text("brandBadge")];
const _categoryFields = [text("featured"), text("pinned")];

declare module "../../plugin/fields/contributions.js" {
  interface EntryMetaContributions {
    productCard: { entryTypes: "product"; fields: typeof _productFields };
    editorial: { entryTypes: "post" | "page"; fields: typeof _editorialFields };
  }
  interface TermMetaContributions {
    brandBox: { termTaxonomies: "brand"; fields: typeof _brandFields };
    categoryCard: {
      termTaxonomies: "category";
      fields: typeof _categoryFields;
    };
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

  test("forTermTaxonomy matches a term node; .slug narrows the term", () => {
    const rules = [
      forTermTaxonomy("category")
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
  test("forEntryType types data.entry from the registry projection with folded meta", () => {
    forEntryType("post").template(({ data }) => {
      expectTypeOf(data.entry.slug).toEqualTypeOf<string>();
      expectTypeOf(data.entry.meta.featured).toEqualTypeOf<
        string | undefined
      >();
      // @ts-expect-error - "nope" is not a declared meta field of post
      void data.entry.meta.nope;
      return null;
    });
    forEntryType("product").template(({ data }) => {
      expectTypeOf(data.entry.price).toEqualTypeOf<number>();
      // Read shape: .default() and .required() both narrow away undefined.
      expectTypeOf(data.entry.meta.badge).toEqualTypeOf<string>();
      expectTypeOf(data.entry.meta.tier).toEqualTypeOf<string>();
      // @ts-expect-error - "nope" is not a declared meta field of product
      void data.entry.meta.nope;
      return null;
    });
    forEntryType("product").archive.template(({ data: _data }) => {
      type ArchiveEntry = (typeof _data.entries)[number];
      expectTypeOf<ArchiveEntry["price"]>().toEqualTypeOf<number>();
      expectTypeOf<ArchiveEntry["meta"]["badge"]>().toEqualTypeOf<string>();
      return null;
    });
  });

  test("forTermTaxonomy types data.term from the registry projection with folded meta", () => {
    forTermTaxonomy("category").template(({ data }) => {
      expectTypeOf(data.term.slug).toEqualTypeOf<string>();
      expectTypeOf(data.term.meta.pinned).toEqualTypeOf<string | undefined>();
      return null;
    });
    forTermTaxonomy("brand")
      .slug("acme")
      .template(({ data }) => {
        expectTypeOf(data.term.logoUrl).toEqualTypeOf<string | null>();
        expectTypeOf(data.term.meta.brandBadge).toEqualTypeOf<
          string | undefined
        >();
        // @ts-expect-error - "nope" is not a declared meta field of brand
        void data.term.meta.nope;
        return null;
      });
  });

  test("unregistered names are compile errors", () => {
    // @ts-expect-error - not a registered entry type
    forEntryType("nope");
    // @ts-expect-error - not a registered taxonomy
    forTermTaxonomy("nope");
  });

  test("whereMeta types keys and values against the stored meta shapes", () => {
    forEntryType("product")
      .whereMeta("tier", "gold")
      .template(() => null);
    // Stored shape, not read shape: .default() applies at decode time,
    // so storage can still lack the key.
    forEntryType("product")
      .whereMeta("badge", undefined)
      .template(() => null);
    // @ts-expect-error - required fields store non-optional values
    forEntryType("product").whereMeta("tier", undefined);
    // @ts-expect-error - "nope" is not a meta key of product
    forEntryType("product").whereMeta("nope", "x");
    // @ts-expect-error - badge stores a string, not a number
    forEntryType("product").whereMeta("badge", 5);
  });

  test("forTermTaxonomy.whereMeta types keys and values against the stored meta shapes", () => {
    forTermTaxonomy("brand")
      .whereMeta("brandBadge", "gold")
      .template(() => null);
    // @ts-expect-error - "nope" is not a meta key of brand
    forTermTaxonomy("brand").whereMeta("nope", "x");
    // @ts-expect-error - brandBadge stores a string, not a number
    forTermTaxonomy("brand").whereMeta("brandBadge", 5);
  });

  test("forTermTaxonomy.where types data from the term projection with folded meta", () => {
    forTermTaxonomy("brand")
      .where((data) => {
        expectTypeOf(data.term.logoUrl).toEqualTypeOf<string | null>();
        expectTypeOf(data.term.meta.brandBadge).toEqualTypeOf<
          string | undefined
        >();
        return data.term.logoUrl !== null;
      })
      .template(() => null);
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
        .whereMeta("featured", "yes")
        .template(() => null),
      entry(() => null),
    ];
    expect(
      resolveTemplate(rules, postNode, entryData({ featured: "yes" }))?.match,
    ).toBeDefined();
    expect(
      resolveTemplate(rules, postNode, entryData({ featured: "no" }))?.tier,
    ).toBe("entry");
  });

  test("where evaluates an arbitrary predicate over the resolved data", () => {
    const rules = [
      forEntryType("post")
        .where((data) => data.entry.meta.premium === "1")
        .template(() => null),
      entry(() => null),
    ];
    expect(
      resolveTemplate(rules, postNode, entryData({ premium: "1" }))?.match,
    ).toBeDefined();
    expect(
      resolveTemplate(rules, postNode, entryData({ premium: "0" }))?.tier,
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
        .whereMeta("featured", "yes")
        .template(() => null),
      entry(() => null),
    ];
    expect(resolveTemplate(rules, postNode)?.tier).toBe("entry");
  });
});

describe("resolveTemplate — term predicate rules (whereMeta / where / named)", () => {
  const catTerm: ResolvedNode = {
    kind: "term",
    taxonomy: "category",
    slug: "news",
    databaseId: 1,
  };
  const termData = (meta: Record<string, unknown>): TemplateData =>
    ({ kind: "taxonomy", term: { meta } }) as unknown as TemplateData;

  test("whereMeta matches when the term-meta value equals; else falls through", () => {
    const rules = [
      forTermTaxonomy("category")
        .whereMeta("featured", "yes")
        .template(() => null),
      taxonomy(() => null),
    ];
    expect(
      resolveTemplate(rules, catTerm, termData({ featured: "yes" }))?.match,
    ).toBeDefined();
    expect(
      resolveTemplate(rules, catTerm, termData({ featured: "no" }))?.tier,
    ).toBe("taxonomy");
  });

  test("where evaluates an arbitrary predicate over the resolved data", () => {
    const rules = [
      forTermTaxonomy("category")
        .where((data) => data.term.meta.pinned === "1")
        .template(() => null),
      taxonomy(() => null),
    ];
    expect(
      resolveTemplate(rules, catTerm, termData({ pinned: "1" }))?.match,
    ).toBeDefined();
    expect(
      resolveTemplate(rules, catTerm, termData({ pinned: "0" }))?.tier,
    ).toBe("taxonomy");
  });

  test("named matches the stored template choice and carries its label", () => {
    const rule = forTermTaxonomy("category")
      .named("spotlight", "Spotlight")
      .template(() => null);
    expect(rule.match?.named).toEqual({ id: "spotlight", label: "Spotlight" });
    expect(
      resolveTemplate(
        [rule],
        catTerm,
        termData({ [NAMED_TEMPLATE_META_KEY]: "spotlight" }),
      ),
    ).toBe(rule);
    expect(resolveTemplate([rule], catTerm, termData({}))).toBeUndefined();
  });

  test("a predicate rule never matches when data is absent", () => {
    const rules = [
      forTermTaxonomy("category")
        .whereMeta("featured", "yes")
        .template(() => null),
      taxonomy(() => null),
    ];
    expect(resolveTemplate(rules, catTerm)?.tier).toBe("taxonomy");
  });
});

describe("resolveTemplate — forAuthor targeted rules", () => {
  const janeNode: ResolvedNode = {
    kind: "author",
    slug: "jane",
    databaseId: 7,
  };

  test("forAuthor().slug narrows the author and beats the generic tier", () => {
    const rules = [
      author(() => null),
      forAuthor()
        .slug("jane")
        .template(() => null),
    ];
    expect(resolveTemplate(rules, janeNode)?.match?.slug).toBe("jane");
    // A different author falls through to the generic `author` tier.
    expect(resolveTemplate(rules, { ...janeNode, slug: "john" })?.tier).toBe(
      "author",
    );
  });

  test("forAuthor().id narrows by databaseId", () => {
    const rules = [
      forAuthor()
        .id(7)
        .template(() => null),
      author(() => null),
    ];
    expect(resolveTemplate(rules, janeNode)?.match?.id).toBe(7);
    expect(resolveTemplate(rules, { ...janeNode, databaseId: 99 })?.tier).toBe(
      "author",
    );
  });

  test("bare forAuthor().template matches any author node", () => {
    const rule = forAuthor().template(() => null);
    expect(rule.match?.nodeKind).toBe("author");
    expect(rule.match?.type).toBe("author");
    expect(resolveTemplate([rule], janeNode)).toBe(rule);
  });

  test("data.author is typed as ResolvedAuthor", () => {
    forAuthor()
      .slug("jane")
      .template(({ data }) => {
        expectTypeOf(data).toEqualTypeOf<AuthorArchiveData>();
        expectTypeOf(data.author).toEqualTypeOf<AuthorArchiveData["author"]>();
        return null;
      });
  });
});

describe("resolveTemplate — forDate targeted rules", () => {
  const dayNode: ResolvedNode = {
    kind: "date",
    year: 2026,
    month: 7,
    day: 21,
  };
  const yearNode: ResolvedNode = {
    kind: "date",
    year: 2026,
    month: null,
    day: null,
  };

  test("forDate matches its exact granularity and beats the generic tier", () => {
    const rules = [date(() => null), forDate(2026, 7, 21).template(() => null)];
    expect(resolveTemplate(rules, dayNode)?.match?.day).toBe(21);
    // A different day falls through to the generic `date` tier.
    expect(resolveTemplate(rules, { ...dayNode, day: 22 })?.tier).toBe("date");
  });

  test("a coarser forDate matches only that granularity, not a finer node", () => {
    const rules = [forDate(2026).template(() => null), date(() => null)];
    // The year matcher (month/day unset) matches the year node.
    expect(resolveTemplate(rules, yearNode)?.match?.year).toBe(2026);
    // ...but a day node with month/day set does not match the year-only rule.
    expect(resolveTemplate(rules, dayNode)?.tier).toBe("date");
  });

  test("forDate carries a fixed `date` type + nodeKind + numeric narrowing", () => {
    const rule = forDate(2026, 7).template(() => null);
    expect(rule.match?.nodeKind).toBe("date");
    expect(rule.match?.type).toBe("date");
    expect(rule.match?.year).toBe(2026);
    expect(rule.match?.month).toBe(7);
    expect(rule.match?.day).toBeUndefined();
  });

  test("data is typed as DateArchiveData", () => {
    forDate(2026).template(({ data }) => {
      expectTypeOf(data).toEqualTypeOf<DateArchiveData>();
      expectTypeOf(data.year).toEqualTypeOf<number>();
      return null;
    });
    // @ts-expect-error - a month needs a year (no zero-arg overload)
    forDate();
  });
});

describe("resolveTemplate — forArchiveType targeted rules", () => {
  const galleryNode: ResolvedNode = { kind: "custom", name: "gallery" };

  test("forArchiveType matches its custom node by name", () => {
    const rules = [
      fallback(() => null),
      forArchiveType("gallery").template(() => null),
    ];
    expect(resolveTemplate(rules, galleryNode)?.match?.type).toBe("gallery");
    // A different archive type falls through to `fallback`.
    expect(
      resolveTemplate(rules, { kind: "custom", name: "events" })?.tier,
    ).toBe("fallback");
  });

  test("the matcher carries nodeKind `custom` + the archive name as type", () => {
    const rule = forArchiveType("gallery").template(() => null);
    expect(rule.match?.nodeKind).toBe("custom");
    expect(rule.match?.type).toBe("gallery");
  });

  test("data is typed from the ArchiveTypeRegistry projection", () => {
    forArchiveType("gallery").template(({ data }) => {
      expectTypeOf(data).toEqualTypeOf<GalleryData>();
      expectTypeOf(data.album).toEqualTypeOf<string>();
      return null;
    });
    // @ts-expect-error - "nope" is not a registered archive type
    forArchiveType("nope");
  });
});

describe("ruleLabel", () => {
  test("a tier rule is labelled by its tier", () => {
    expect(ruleLabel(fallback(() => null))).toBe("fallback");
    expect(ruleLabel(entry(() => null))).toBe("entry");
    expect(ruleLabel(notFound(() => null))).toBe("notFound");
  });

  test("a targeted rule is labelled by type plus any slug/id narrowing", () => {
    expect(ruleLabel(forEntryType("post").template(() => null))).toBe("post");
    expect(
      ruleLabel(
        forEntryType("post")
          .slug("hello")
          .template(() => null),
      ),
    ).toBe("post:hello");
    expect(
      ruleLabel(
        forEntryType("post")
          .id(42)
          .template(() => null),
      ),
    ).toBe("post#42");
    expect(ruleLabel(forEntryType("post").archive.template(() => null))).toBe(
      "archive:post",
    );
  });
});

describe("explainTemplateResolution", () => {
  const postNode: ResolvedNode = {
    kind: "content",
    entryType: "post",
    slug: "hello",
    databaseId: 1,
  };
  const entryData = (meta: Record<string, unknown>): TemplateData =>
    ({ kind: "entry", entry: { meta } }) as unknown as TemplateData;

  test("a targeted rule wins; the generic tier and fallback are never evaluated", () => {
    const rules = [
      fallback(() => null),
      entry(() => null),
      forEntryType("post").template(() => null),
    ];
    const trace = explainTemplateResolution(rules, postNode);
    expect(trace.winner).toBe("post");
    expect(trace.steps).toEqual([
      { label: "fallback", status: "never-evaluated" },
      { label: "entry", status: "never-evaluated" },
      { label: "post", status: "matched" },
    ]);
  });

  test("targeted rules before the winner are skipped; those after are never evaluated", () => {
    const rules = [
      forEntryType("post")
        .slug("other")
        .template(() => null),
      forEntryType("post").template(() => null),
      forEntryType("post")
        .slug("hello")
        .template(() => null),
    ];
    const trace = explainTemplateResolution(rules, postNode);
    expect(trace.winner).toBe("post");
    expect(trace.steps.map((s) => s.status)).toEqual([
      "skipped",
      "matched",
      "never-evaluated",
    ]);
  });

  test("the generic tier wins when no targeted rule matches", () => {
    const rules = [
      forEntryType("post")
        .slug("nope")
        .template(() => null),
      entry(() => null),
      fallback(() => null),
    ];
    const trace = explainTemplateResolution(rules, postNode);
    expect(trace.winner).toBe("entry");
    expect(trace.steps.map((s) => [s.label, s.status])).toEqual([
      ["post:nope", "skipped"],
      ["entry", "matched"],
      ["fallback", "never-evaluated"],
    ]);
  });

  test("fallback wins when neither a targeted rule nor the node's tier is present", () => {
    const rules = [
      forEntryType("post")
        .slug("nope")
        .template(() => null),
      fallback(() => null),
    ];
    const trace = explainTemplateResolution(rules, postNode);
    expect(trace.winner).toBe("fallback");
    expect(trace.steps.map((s) => s.status)).toEqual(["skipped", "matched"]);
  });

  test("no match and no fallback yields a null winner (a 404)", () => {
    const trace = explainTemplateResolution([archive(() => null)], postNode);
    expect(trace.winner).toBeNull();
    expect(trace.steps).toEqual([
      { label: "archive", status: "never-evaluated" },
    ]);
  });

  test("a predicate that fires and passes marks the rule matched with its result", () => {
    const rules = [
      forEntryType("post")
        .whereMeta("featured", "yes")
        .template(() => null),
      entry(() => null),
    ];
    const trace = explainTemplateResolution(
      rules,
      postNode,
      entryData({ featured: "yes" }),
    );
    expect(trace.winner).toBe("post");
    expect(trace.steps[0]).toEqual({
      label: "post",
      status: "matched",
      predicate: { fired: true, result: true },
    });
    expect(trace.steps[1]?.status).toBe("never-evaluated");
  });

  test("a predicate that fires and fails is skipped with its result recorded", () => {
    const rules = [
      forEntryType("post")
        .whereMeta("featured", "yes")
        .template(() => null),
      entry(() => null),
    ];
    const trace = explainTemplateResolution(
      rules,
      postNode,
      entryData({ featured: "no" }),
    );
    expect(trace.winner).toBe("entry");
    expect(trace.steps[0]).toEqual({
      label: "post",
      status: "skipped",
      predicate: { fired: true, result: false },
    });
  });

  test("a predicate does not fire when the identity does not match", () => {
    // The rule targets `page`, but the node is a `post` — identity fails before
    // the predicate is ever consulted.
    const rules = [
      forEntryType("page")
        .whereMeta("featured", "yes")
        .template(() => null),
      entry(() => null),
    ];
    const trace = explainTemplateResolution(
      rules,
      postNode,
      entryData({ featured: "yes" }),
    );
    expect(trace.winner).toBe("entry");
    expect(trace.steps[0]).toEqual({
      label: "page",
      status: "skipped",
      predicate: { fired: false, result: false },
    });
  });

  test("a predicate does not fire when data is absent", () => {
    // Identity matches, but with no `data` the predicate can't be consulted —
    // so it never fires, mirroring `resolveTemplate`'s own short-circuit.
    const rules = [
      forEntryType("post")
        .whereMeta("featured", "yes")
        .template(() => null),
      entry(() => null),
    ];
    const trace = explainTemplateResolution(rules, postNode);
    expect(trace.winner).toBe("entry");
    expect(trace.steps[0]).toEqual({
      label: "post",
      status: "skipped",
      predicate: { fired: false, result: false },
    });
  });
});

describe("collectNamedTemplates", () => {
  test("groups named entry templates by type; dedupes; ignores non-content", () => {
    const map = collectNamedTemplates([
      forEntryType("page")
        .named("landing", "Landing Page")
        .template(() => null),
      forEntryType("page")
        .named("wide", "Wide")
        .template(() => null),
      // Duplicate id within a type keeps the first declaration.
      forEntryType("page")
        .named("landing", "Landing v2")
        .template(() => null),
      forEntryType("post")
        .named("feature", "Feature")
        .template(() => null),
      // Term/fallback rules aren't author-selectable per entry → ignored.
      forTermTaxonomy("category")
        .named("spotlight", "Spotlight")
        .template(() => null),
      fallback(() => null),
    ]);
    expect(map.page).toEqual([
      { id: "landing", label: "Landing Page" },
      { id: "wide", label: "Wide" },
    ]);
    expect(map.post).toEqual([{ id: "feature", label: "Feature" }]);
    expect(map.category).toBeUndefined();
  });

  test("returns an empty map for a theme with no named templates", () => {
    expect(collectNamedTemplates([fallback(() => null)])).toEqual({});
  });
});
