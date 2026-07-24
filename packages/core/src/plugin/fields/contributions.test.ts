import { describe, expectTypeOf, test } from "vitest";

import type {
  ResolvedEntry,
  ResolvedTerm,
} from "../../route/render/resolved-entry.js";
import type { PluginSetupContext } from "../setup-context.js";
import type {
  InferFields,
  InferStoredFields,
  MetaOf,
  SettingsOf,
  StoredMetaOf,
  StoredTermMetaOf,
  TermMetaOf,
  UserMetaOf,
} from "./contributions.js";
import type { LinkValue } from "./link.js";
import { text, textarea } from "./builder.js";
import { group } from "./group.js";
import { link } from "./link.js";
import { repeater } from "./repeater.js";

// Fixture field sets. Registered under test-only entry types / taxonomies so
// the module augmentations (global across the compilation) can't interfere
// with other suites' meta expectations.
const _articleFields = [
  text("subtitle").maxLength(120),
  text("badge").default("none"),
  text("heroCredit").required(),
];

const _seoFields = [textarea("seoTitle")];

const _landingFields = [text("layoutHint")];

const _profileFields = [text("displayName").required()];

const _socialFields = [text("mastodon")];

const _brandingFields = [text("tagline").default("")];

const _brandCardFields = [text("brandBadge")];

// Composite fields: a group namespaces into a nested record, a repeater
// folds into a typed row array — both recurse into `MetaOf`.
const _structuredFields = [
  group("seo").fields([text("title").required(), textarea("description")]),
  repeater("sections").fields([text("heading").required()]),
];

declare module "../../template-registry.js" {
  interface EntryTypeRegistry {
    recipe: { entry: ResolvedEntry };
    landing: { entry: ResolvedEntry };
    bare: { entry: ResolvedEntry };
    structured: { entry: ResolvedEntry };
  }
  interface TermTaxonomyRegistry {
    cuisine: { term: ResolvedTerm };
    bareTax: { term: ResolvedTerm };
  }
}

declare module "./contributions.js" {
  interface EntryMetaContributions {
    cxArticle: { entryTypes: "recipe"; fields: typeof _articleFields };
    cxSeo: { entryTypes: "recipe" | "landing"; fields: typeof _seoFields };
    cxLandingOnly: { entryTypes: "landing"; fields: typeof _landingFields };
    cxStructured: {
      entryTypes: "structured";
      fields: typeof _structuredFields;
    };
  }
  interface TermMetaContributions {
    cxBrandCard: { termTaxonomies: "cuisine"; fields: typeof _brandCardFields };
  }
  interface UserMetaContributions {
    cxProfile: { fields: typeof _profileFields };
    cxSocial: { fields: typeof _socialFields };
  }
  interface SettingsContributions {
    cxBranding: { fields: typeof _brandingFields };
  }
}

// Never invoked — the drift check is purely compile-time. When a
// contribution declaration exists for a box id / group name, the
// registration call must match it; undeclared ids stay unconstrained.
const _driftChecks = (ctx: PluginSetupContext) => {
  ctx.registerEntryMetaBox("cxArticle", {
    label: "Article",
    entryTypes: ["recipe"],
    fields: _articleFields,
  });
  ctx.registerEntryMetaBox("cxSeo", {
    label: "SEO",
    entryTypes: ["recipe", "landing"],
    fields: _seoFields,
  });
  // @ts-expect-error - registration must list every declared entry type
  ctx.registerEntryMetaBox("cxSeo", {
    label: "SEO",
    entryTypes: ["recipe"],
    fields: _seoFields,
  });
  // @ts-expect-error - "landing" is not in the declared target set
  ctx.registerEntryMetaBox("cxArticle", {
    label: "Article",
    entryTypes: ["recipe", "landing"],
    fields: _articleFields,
  });
  // @ts-expect-error - fields drift from the declaration
  ctx.registerEntryMetaBox("cxArticle", {
    label: "Article",
    entryTypes: ["recipe"],
    fields: _seoFields,
  });
  // @ts-expect-error - a missing field is drift too
  ctx.registerEntryMetaBox("cxArticle", {
    label: "Article",
    entryTypes: ["recipe"],
    fields: [text("subtitle").maxLength(120)],
  });
  // A same-shape inline rewrite is not drift — the check is structural.
  ctx.registerEntryMetaBox("cxArticle", {
    label: "Article",
    entryTypes: ["recipe"],
    fields: [
      text("subtitle").maxLength(120),
      text("badge").default("none"),
      text("heroCredit").required(),
    ],
  });
  // @ts-expect-error - same read shape but drifted stored shape (.default() vs .required())
  ctx.registerEntryMetaBox("cxArticle", {
    label: "Article",
    entryTypes: ["recipe"],
    fields: [
      text("subtitle").maxLength(120),
      text("badge").required(),
      text("heroCredit").required(),
    ],
  });
  // Undeclared box id: no declaration to drift from.
  ctx.registerEntryMetaBox("undeclared", {
    label: "Anything",
    entryTypes: ["recipe", "whatever"],
    fields: [text("anything")],
  });

  ctx.registerTermMetaBox("cxBrandCard", {
    label: "Brand card",
    termTaxonomies: ["cuisine"],
    fields: _brandCardFields,
  });
  // @ts-expect-error - taxonomy set drifts from the declaration
  ctx.registerTermMetaBox("cxBrandCard", {
    label: "Brand card",
    termTaxonomies: ["bareTax"],
    fields: _brandCardFields,
  });

  ctx.registerUserMetaBox("cxProfile", {
    label: "Profile",
    fields: _profileFields,
  });
  // @ts-expect-error - fields drift from the declaration
  ctx.registerUserMetaBox("cxProfile", {
    label: "Profile",
    fields: _socialFields,
  });

  ctx.registerSettingsGroup("cxBranding", {
    label: "Branding",
    fields: _brandingFields,
  });
  // @ts-expect-error - fields drift from the declaration
  ctx.registerSettingsGroup("cxBranding", {
    label: "Branding",
    fields: _profileFields,
  });
};

describe("InferFields / InferStoredFields", () => {
  test("read shape narrows per chain; stored shape only narrows on .required()", () => {
    type Read = InferFields<typeof _articleFields>;
    expectTypeOf<Read["subtitle"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Read["badge"]>().toEqualTypeOf<string>();
    expectTypeOf<Read["heroCredit"]>().toEqualTypeOf<string>();

    type Stored = InferStoredFields<typeof _articleFields>;
    expectTypeOf<Stored["subtitle"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Stored["badge"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Stored["heroCredit"]>().toEqualTypeOf<string>();
  });

  test("link() folds its LinkValue shape into the typed record", () => {
    const _ctaFields = [link("cta"), link("banner").required()] as const;

    type Read = InferFields<typeof _ctaFields>;
    expectTypeOf<Read["cta"]>().toEqualTypeOf<LinkValue | undefined>();
    expectTypeOf<Read["banner"]>().toEqualTypeOf<LinkValue>();

    type Stored = InferStoredFields<typeof _ctaFields>;
    expectTypeOf<Stored["cta"]>().toEqualTypeOf<LinkValue | undefined>();
    expectTypeOf<Stored["banner"]>().toEqualTypeOf<LinkValue>();
  });

  test("non-builder definitions contribute nothing to the typed record", () => {
    const _mixed = [
      text("typed"),
      // Object-literal authoring carries no phantom types — it degrades
      // to absence from the record rather than poisoning it.
      { key: "untyped", label: "Untyped", type: "string", inputType: "text" },
    ] as const;
    expectTypeOf<keyof InferFields<typeof _mixed>>().toEqualTypeOf<"typed">();
  });
});

describe("MetaOf fold", () => {
  test("folds every contribution whose entry-type set includes K", () => {
    type Recipe = MetaOf<"recipe">;
    expectTypeOf<keyof Recipe>().toEqualTypeOf<
      "subtitle" | "badge" | "heroCredit" | "seoTitle"
    >();
    expectTypeOf<Recipe["badge"]>().toEqualTypeOf<string>();
    expectTypeOf<Recipe["seoTitle"]>().toEqualTypeOf<string | undefined>();

    type Landing = MetaOf<"landing">;
    expectTypeOf<keyof Landing>().toEqualTypeOf<"seoTitle" | "layoutHint">();
  });

  test("no contributions folds to a closed empty record, not an open index", () => {
    expectTypeOf<keyof MetaOf<"bare">>().toEqualTypeOf<never>();
  });

  test("stored fold types whereMeta-facing values from the stored shape", () => {
    type Stored = StoredMetaOf<"recipe">;
    expectTypeOf<Stored["badge"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<Stored["heroCredit"]>().toEqualTypeOf<string>();
  });

  test("folds composite fields as typed nested records / row arrays", () => {
    type M = MetaOf<"structured">;
    // `group()` reads as a typed nested object under its own key.
    expectTypeOf<M["seo"]>().toEqualTypeOf<
      { title: string; description: string | undefined } | undefined
    >();
    // `repeater()` reads as a typed row array; the row type recurses.
    type Sections = NonNullable<M["sections"]>;
    expectTypeOf<Sections[number]["heading"]>().toEqualTypeOf<string>();
  });
});

describe("term / user / settings folds", () => {
  test("TermMetaOf folds taxonomy-scoped contributions", () => {
    expectTypeOf<keyof TermMetaOf<"cuisine">>().toEqualTypeOf<"brandBadge">();
    expectTypeOf<
      keyof StoredTermMetaOf<"cuisine">
    >().toEqualTypeOf<"brandBadge">();
    expectTypeOf<keyof TermMetaOf<"bareTax">>().toEqualTypeOf<never>();
  });

  test("UserMetaOf folds every contribution (flat keyspace)", () => {
    expectTypeOf<keyof UserMetaOf>().toEqualTypeOf<
      "displayName" | "mastodon"
    >();
    expectTypeOf<UserMetaOf["displayName"]>().toEqualTypeOf<string>();
  });

  test("SettingsOf types one group by name", () => {
    expectTypeOf<SettingsOf<"cxBranding">["tagline"]>().toEqualTypeOf<string>();
    expectTypeOf<keyof SettingsOf<"cxBranding">>().toEqualTypeOf<"tagline">();
  });
});
