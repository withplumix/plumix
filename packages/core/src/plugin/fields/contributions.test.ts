import { describe, expectTypeOf, test } from "vitest";

import type {
  ResolvedEntry,
  ResolvedTerm,
} from "../../route/render/resolved-entry.js";
import type { PluginSetupContext } from "../setup-context.js";
import type {
  EntryMeta,
  InferFields,
  InferStoredFields,
  MetaOf,
  SettingsMeta,
  SettingsOf,
  StoredMetaOf,
  StoredTermMetaOf,
  TermMeta,
  TermMetaOf,
  UserMeta,
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

// Helper-alias fixtures — the same contributions authored through the
// `EntryMeta` / `TermMeta` / `UserMeta` / `SettingsMeta` shape helpers
// instead of the hand-written `{ entryTypes; fields }` object type.
const _helpedFields = [text("kicker").required(), text("deck")];

const _helpedTermFields = [text("badgeText")];

const _helpedUserFields = [text("pronouns")];

const _helpedSettingsFields = [text("siteTagline").required()];

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
    helped: { entry: ResolvedEntry };
  }
  interface TermTaxonomyRegistry {
    cuisine: { term: ResolvedTerm };
    bareTax: { term: ResolvedTerm };
    helpedTax: { term: ResolvedTerm };
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
    // Authored through the `EntryMeta` helper — folds identically to the
    // hand-written shapes above.
    cxHelped: EntryMeta<"helped", typeof _helpedFields>;
  }
  interface TermMetaContributions {
    cxBrandCard: { termTaxonomies: "cuisine"; fields: typeof _brandCardFields };
    cxHelpedTerm: TermMeta<"helpedTax", typeof _helpedTermFields>;
  }
  interface UserMetaContributions {
    cxProfile: { fields: typeof _profileFields };
    cxSocial: { fields: typeof _socialFields };
    cxHelpedUser: UserMeta<typeof _helpedUserFields>;
  }
  interface SettingsContributions {
    cxBranding: { fields: typeof _brandingFields };
    cxHelpedSettings: SettingsMeta<typeof _helpedSettingsFields>;
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

  // Helper-authored declarations interoperate with the drift check exactly
  // like the hand-written shapes — the registration typechecks against the
  // `EntryMeta` / `TermMeta` / `UserMeta` / `SettingsMeta` contribution.
  ctx.registerEntryMetaBox("cxHelped", {
    label: "Helped",
    entryTypes: ["helped"],
    fields: _helpedFields,
  });
  // @ts-expect-error - drift still fires through a helper-authored declaration
  ctx.registerEntryMetaBox("cxHelped", {
    label: "Helped",
    entryTypes: ["landing"],
    fields: _helpedFields,
  });
  ctx.registerTermMetaBox("cxHelpedTerm", {
    label: "Helped term",
    termTaxonomies: ["helpedTax"],
    fields: _helpedTermFields,
  });
  ctx.registerUserMetaBox("cxHelpedUser", {
    label: "Helped user",
    fields: _helpedUserFields,
  });
  ctx.registerSettingsGroup("cxHelpedSettings", {
    label: "Helped settings",
    fields: _helpedSettingsFields,
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
    // `pronouns` comes from the `UserMeta`-helper-authored contribution —
    // the flat user keyspace folds it in alongside the literal ones.
    expectTypeOf<keyof UserMetaOf>().toEqualTypeOf<
      "displayName" | "mastodon" | "pronouns"
    >();
    expectTypeOf<UserMetaOf["displayName"]>().toEqualTypeOf<string>();
  });

  test("SettingsOf types one group by name", () => {
    expectTypeOf<SettingsOf<"cxBranding">["tagline"]>().toEqualTypeOf<string>();
    expectTypeOf<keyof SettingsOf<"cxBranding">>().toEqualTypeOf<"tagline">();
  });
});

describe("contribution shape helpers", () => {
  test("each helper expands to the hand-written contribution shape", () => {
    // The helpers are pure aliases — folding reads the same properties
    // (`entryTypes` / `termTaxonomies` / `fields`) either way, so a typo'd
    // property name is unreachable once an author goes through them.
    expectTypeOf<EntryMeta<"helped", typeof _helpedFields>>().toEqualTypeOf<{
      entryTypes: "helped";
      fields: typeof _helpedFields;
    }>();
    expectTypeOf<
      TermMeta<"helpedTax", typeof _helpedTermFields>
    >().toEqualTypeOf<{
      termTaxonomies: "helpedTax";
      fields: typeof _helpedTermFields;
    }>();
    expectTypeOf<UserMeta<typeof _helpedUserFields>>().toEqualTypeOf<{
      fields: typeof _helpedUserFields;
    }>();
    expectTypeOf<SettingsMeta<typeof _helpedSettingsFields>>().toEqualTypeOf<{
      fields: typeof _helpedSettingsFields;
    }>();
  });

  test("helper-authored contributions fold into MetaOf like literal ones", () => {
    type M = MetaOf<"helped">;
    expectTypeOf<keyof M>().toEqualTypeOf<"kicker" | "deck">();
    expectTypeOf<M["kicker"]>().toEqualTypeOf<string>();
    expectTypeOf<M["deck"]>().toEqualTypeOf<string | undefined>();
  });

  test("term / settings helpers fold through their own registries", () => {
    expectTypeOf<keyof TermMetaOf<"helpedTax">>().toEqualTypeOf<"badgeText">();
    expectTypeOf<
      SettingsOf<"cxHelpedSettings">["siteTagline"]
    >().toEqualTypeOf<string>();
  });
});
