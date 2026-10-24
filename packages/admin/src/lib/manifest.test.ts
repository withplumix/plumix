import { afterEach, describe, expect, test, vi } from "vitest";

import type {
  EntryMetaBoxManifestEntry,
  PlumixManifest,
  SettingsPageManifestEntry,
  UserMetaBoxManifestEntry,
} from "@plumix/core/manifest";
import { buildManifest, createPluginRegistry } from "@plumix/core/manifest";

import {
  accessPoliciesForType,
  entryMetaBoxesForType,
  findEntryTypeBySlug,
  findPluginPageByPath,
  findSettingsGroupByName,
  findSettingsPageByName,
  findTermTaxonomyByName,
  getAllowedBlocks,
  getConfiguredSlots,
  getPatterns,
  getThemeBreakpoints,
  groupsForSettingsPage,
  hasAuthorRoutes,
  namedTemplatesForType,
  parseManifest,
  visibleDashboardWidgets,
  visibleEntryTypes,
  visibleSettingsPages,
  visibleTermTaxonomies,
  visibleUserMetaBoxes,
} from "./manifest.js";

describe("parseManifest", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns empty manifest when the script tag is absent", () => {
    expect(parseManifest(null)).toEqual({});
  });

  test("parses the injected JSON payload", () => {
    // Raw JSON payload — parseManifest doesn't synthesize labels; the
    // tested behaviour is "round-trip a posted JSON shape", separate
    // from the wire-required `labels` field on manifest entries.
    const text = JSON.stringify({
      entryTypes: [{ name: "post", label: "Posts" }],
    });
    expect(parseManifest(text)).toEqual({
      entryTypes: [{ name: "post", label: "Posts" }],
    });
  });

  test("carries i18n config through to consumers", () => {
    const i18n = {
      defaultLocale: "en",
      locales: [
        { code: "en", label: "English", direction: "ltr", enabled: true },
        { code: "ar", label: "العربية", direction: "rtl", enabled: true },
      ],
    };
    const text = JSON.stringify({ i18n });
    expect(parseManifest(text).i18n).toEqual(i18n);
  });

  test("carries theme tokens through to consumers", () => {
    const tokens = {
      colors: { brand: { value: "#0070f3", label: "Brand" } },
    };
    const text = JSON.stringify({ tokens });
    expect(parseManifest(text).tokens).toEqual(tokens);
  });

  test("carries the configured-slot roster through to consumers", () => {
    const configuredSlots = {
      storage: true,
      imageDelivery: false,
      kv: false,
      cdn: false,
      mailer: true,
    };
    const text = JSON.stringify({ configuredSlots });
    expect(parseManifest(text).configuredSlots).toEqual(configuredSlots);
  });

  test("carries the admin page list through to consumers", () => {
    const adminPages = [
      {
        to: "/pages/audit-detail",
        component: "AuditDetail",
        title: "Audit Detail",
        capability: "audit:read",
      },
    ];
    const text = JSON.stringify({ adminPages });
    expect(parseManifest(text).adminPages).toEqual(adminPages);
  });

  test("empty payload falls back to empty manifest", () => {
    expect(parseManifest("")).toEqual({});
  });

  test("malformed JSON logs and falls back without throwing", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {
      // swallow expected error log
    });
    expect(parseManifest("{not-json")).toEqual({});
    expect(errSpy).toHaveBeenCalledOnce();
  });

  test("non-array entryTypes coerces to empty array", () => {
    const text = JSON.stringify({ entryTypes: "oops" });
    expect(parseManifest(text)).toEqual({});
  });

  test("non-array metaBoxes is dropped from the result", () => {
    const text = JSON.stringify({ entryTypes: [], entryMetaBoxes: "oops" });
    const result = parseManifest(text);
    expect(result.entryTypes).toEqual([]);
    expect(result.entryMetaBoxes).toBeUndefined();
  });

  test("parses the injected JSON payload with metaBoxes", () => {
    const text = JSON.stringify({
      entryMetaBoxes: [
        {
          id: "seo",
          label: "SEO",
          entryTypes: ["post"],
          fields: [],
        },
      ],
    });
    expect(parseManifest(text)).toEqual({
      entryMetaBoxes: [
        {
          id: "seo",
          label: "SEO",
          entryTypes: ["post"],
          fields: [],
        },
      ],
    });
  });

  test("parses the injected JSON payload with termTaxonomies", () => {
    const text = JSON.stringify({
      termTaxonomies: [
        {
          name: "category",
          label: "Categories",
          isHierarchical: true,
        },
      ],
    });
    expect(parseManifest(text)).toEqual({
      termTaxonomies: [
        {
          name: "category",
          label: "Categories",
          isHierarchical: true,
        },
      ],
    });
  });

  test("non-array termTaxonomies is dropped from the result", () => {
    const text = JSON.stringify({
      entryTypes: [],
      termTaxonomies: "not-an-array",
    });
    expect(parseManifest(text).termTaxonomies).toBeUndefined();
  });

  test("a plugin-registered dashboard widget survives projection and normalization", () => {
    const registry = createPluginRegistry();
    registry.dashboardWidgets.set("widget-plugin:hello", {
      id: "widget-plugin:hello",
      title: "Hello",
      component: "HelloWidget",
      registeredBy: "widget-plugin",
    });
    const manifest = buildManifest(registry, { tokens: {} });

    // The only path that exercises the normalizer; the `source` param skips it.
    const read = parseManifest(JSON.stringify(manifest));

    expect(visibleDashboardWidgets([], read).map((w) => w.id)).toEqual([
      "widget-plugin:hello",
    ]);
  });

  test("theme breakpoints survive projection and normalization", () => {
    const breakpoints = { tablet: 900, mobile: 500 };
    const manifest = buildManifest(createPluginRegistry(), {
      tokens: {},
      breakpoints,
    });

    const read = parseManifest(JSON.stringify(manifest));

    expect(getThemeBreakpoints(read)).toEqual(breakpoints);
  });
});

describe("findEntryTypeBySlug", () => {
  const source: PlumixManifest = {
    entryTypes: [
      {
        name: "post",
        adminSlug: "posts",
        label: "Posts",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
        capabilityType: "post",
      },
      {
        name: "product",
        capabilityType: "product",
        adminSlug: "products",
        label: "Products",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
      },
    ],
  };

  test("returns the matching entry", () => {
    expect(findEntryTypeBySlug("products", source)?.name).toBe("product");
  });

  test("returns undefined when no entry matches", () => {
    expect(findEntryTypeBySlug("nope", source)).toBeUndefined();
  });
});

describe("findPluginPageByPath", () => {
  const manifest: PlumixManifest = {
    adminNav: [],
    adminPages: [
      {
        to: "/pages/audit-detail",
        component: "AuditDetail",
        title: "Audit Detail",
      },
    ],
  };

  test("finds a page that has no adminNav entry", () => {
    expect(findPluginPageByPath("/pages/audit-detail", manifest)).toEqual({
      to: "/pages/audit-detail",
      component: "AuditDetail",
      title: "Audit Detail",
    });
  });

  test("returns undefined for a path no page registered", () => {
    expect(findPluginPageByPath("/pages/unknown", manifest)).toBeUndefined();
  });
});

describe("namedTemplatesForType", () => {
  const source: PlumixManifest = {
    entryTypes: [
      {
        name: "page",
        capabilityType: "page",
        adminSlug: "pages",
        label: "Pages",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
        namedTemplates: [{ id: "landing", label: "Landing Page" }],
      },
      {
        name: "post",
        capabilityType: "post",
        adminSlug: "posts",
        label: "Posts",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
      },
    ],
  };

  test("returns the type's named templates", () => {
    expect(namedTemplatesForType("page", source)).toEqual([
      { id: "landing", label: "Landing Page" },
    ]);
  });

  test("returns an empty list for a type with none or an unknown type", () => {
    expect(namedTemplatesForType("post", source)).toEqual([]);
    expect(namedTemplatesForType("nope", source)).toEqual([]);
  });
});

describe("accessPoliciesForType", () => {
  const source: PlumixManifest = {
    entryTypes: [
      {
        name: "article",
        capabilityType: "article",
        adminSlug: "articles",
        label: "Articles",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
        accessPolicies: [{ key: "members", label: "Members only" }],
      },
      {
        name: "post",
        capabilityType: "post",
        adminSlug: "posts",
        label: "Posts",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
      },
    ],
  };

  test("returns the type's selectable access policies", () => {
    expect(accessPoliciesForType("article", source)).toEqual([
      { key: "members", label: "Members only" },
    ]);
  });

  test("returns an empty list for a type with none or an unknown type", () => {
    expect(accessPoliciesForType("post", source)).toEqual([]);
    expect(accessPoliciesForType("nope", source)).toEqual([]);
  });
});

describe("visibleEntryTypes", () => {
  const source: PlumixManifest = {
    entryTypes: [
      {
        name: "post",
        capabilityType: "post",
        adminSlug: "posts",
        label: "Posts",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
      },
      {
        name: "product",
        adminSlug: "products",
        label: "Products",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
        capabilityType: "product",
      },
      {
        name: "news",
        adminSlug: "news",
        label: "News",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
        capabilityType: "post",
      },
    ],
  };

  test("filters by the manifest's resolved `${capabilityType}:edit_own`", () => {
    const caps = ["entry:post:edit_own", "entry:post:read"];
    const visible = visibleEntryTypes(caps, source).map((pt) => pt.name);
    // `post` → "entry:post:edit_own" ✓; `news` pools onto "post" ✓;
    // `product` needs "entry:product:edit_own" which isn't granted ✗
    expect(visible).toEqual(["post", "news"]);
  });

  test("returns empty when no capabilities match", () => {
    expect(visibleEntryTypes([], source)).toEqual([]);
  });

  test("hides entry types whose `showInSidebar` is false", () => {
    // Contributors hold `entry:media:edit_own`, so the capability gate alone
    // would still show a type that opted out of the sidebar.
    const sourceWithHidden: PlumixManifest = {
      entryTypes: [
        {
          name: "post",
          capabilityType: "post",
          adminSlug: "posts",
          label: "Posts",
          isPublic: true,
          showUI: true,
          showInSidebar: true,
        },
        {
          name: "media",
          capabilityType: "media",
          adminSlug: "media",
          label: "Media",
          isPublic: true,
          showUI: true,
          showInSidebar: false,
        },
      ],
    };
    const caps = ["entry:post:edit_own", "entry:media:edit_own"];
    const visible = visibleEntryTypes(caps, sourceWithHidden).map(
      (pt) => pt.name,
    );
    expect(visible).toEqual(["post"]);
  });
});

describe("entryMetaBoxesForType", () => {
  const box = (
    id: string,
    overrides: Partial<EntryMetaBoxManifestEntry> = {},
  ): EntryMetaBoxManifestEntry => ({
    id,
    label: id,
    entryTypes: ["post"],
    fields: [],
    ...overrides,
  });

  test("returns boxes applicable to the post type, honours priority order", () => {
    const source: PlumixManifest = {
      entryMetaBoxes: [
        box("a", { priority: 20 }),
        box("b", { priority: 0 }),
        box("c"), // unspecified → sorts last
      ],
    };
    const ids = entryMetaBoxesForType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["b", "a", "c"]);
  });

  test("boxes at the same priority break ties by id alphabetical", () => {
    const source: PlumixManifest = {
      entryMetaBoxes: [
        box("second", { priority: 0 }),
        box("first", { priority: 0 }),
      ],
    };
    const ids = entryMetaBoxesForType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["first", "second"]);
  });

  test("drops boxes whose `entryTypes` doesn't include the target", () => {
    const source: PlumixManifest = {
      entryMetaBoxes: [
        box("seo", { entryTypes: ["post"] }),
        box("shop", { entryTypes: ["product"] }),
      ],
    };
    const ids = entryMetaBoxesForType("post", [], source).map((b) => b.id);
    expect(ids).toEqual(["seo"]);
  });

  test("drops boxes gated by a capability the user lacks", () => {
    const source: PlumixManifest = {
      entryMetaBoxes: [
        box("public"),
        box("privileged", { capability: "entry:post:edit_any" }),
      ],
    };
    const withoutCap = entryMetaBoxesForType("post", [], source).map(
      (b) => b.id,
    );
    expect(withoutCap).toEqual(["public"]);

    const withCap = entryMetaBoxesForType(
      "post",
      ["entry:post:edit_any"],
      source,
    ).map((b) => b.id);
    expect(withCap).toEqual(["privileged", "public"]);
  });

  test("returns empty when no meta boxes are registered", () => {
    const source: PlumixManifest = {};
    expect(entryMetaBoxesForType("post", [], source)).toEqual([]);
  });

  test("hides capability-gated fields from low-cap viewers", () => {
    const source: PlumixManifest = {
      entryMetaBoxes: [
        box("bio", {
          fields: [
            {
              key: "headline",
              label: "Headline",
              type: "string",
              inputType: "text",
            },
            {
              key: "secret",
              label: "Secret",
              type: "string",
              inputType: "text",
              capability: "entry:post:view_secret",
            },
          ],
        }),
      ],
    };
    const lowCap = entryMetaBoxesForType("post", [], source);
    expect(lowCap[0]?.fields.map((f) => f.key)).toEqual(["headline"]);
    const highCap = entryMetaBoxesForType(
      "post",
      ["entry:post:view_secret"],
      source,
    );
    expect(highCap[0]?.fields.map((f) => f.key)).toEqual([
      "headline",
      "secret",
    ]);
  });
});

describe("visibleUserMetaBoxes", () => {
  function userBox(
    id: string,
    overrides: Partial<UserMetaBoxManifestEntry> = {},
  ): UserMetaBoxManifestEntry {
    return {
      id,
      label: id,
      fields: [],
      ...overrides,
    };
  }

  const source: PlumixManifest = {
    userMetaBoxes: [
      userBox("public"),
      userBox("privileged", { capability: "user:edit" }),
    ],
  };

  test("an undefined-capability box is visible regardless of viewer caps", () => {
    const ids = visibleUserMetaBoxes([], source).map((b) => b.id);
    expect(ids).toContain("public");
  });

  test("drops boxes gated by a capability the viewer lacks", () => {
    const ids = visibleUserMetaBoxes([], source).map((b) => b.id);
    expect(ids).toEqual(["public"]);
  });

  test("keeps capability-gated boxes when the viewer has the cap", () => {
    const ids = visibleUserMetaBoxes(["user:edit"], source).map((b) => b.id);
    expect(ids).toEqual(["privileged", "public"]);
  });

  test("returns empty when no user meta boxes are registered", () => {
    expect(visibleUserMetaBoxes(["user:edit"], {})).toEqual([]);
  });
});

describe("findTermTaxonomyByName", () => {
  const source: PlumixManifest = {
    termTaxonomies: [
      {
        name: "category",
        label: "Categories",
        isHierarchical: true,
        isPublic: true,
        showUI: true,
        showInSidebar: true,
      },
      {
        name: "tag",
        label: "Tags",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
      },
    ],
  };

  test("returns the matching taxonomy", () => {
    expect(findTermTaxonomyByName("tag", source)?.label).toBe("Tags");
  });

  test("returns undefined when no taxonomy matches", () => {
    expect(findTermTaxonomyByName("mystery", source)).toBeUndefined();
  });
});

describe("visibleTermTaxonomies", () => {
  const source: PlumixManifest = {
    termTaxonomies: [
      {
        name: "category",
        label: "Categories",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
      },
      {
        name: "tag",
        label: "Tags",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
      },
      {
        name: "internal",
        label: "Internal",
        isPublic: true,
        showUI: true,
        showInSidebar: true,
      },
    ],
  };

  test("filters by per-taxonomy :read capability", () => {
    const caps = ["term:category:read", "term:tag:read"];
    const visible = visibleTermTaxonomies(caps, source).map((t) => t.name);
    expect(visible).toEqual(["category", "tag"]);
  });

  test("returns empty when the caller has no taxonomy :read caps", () => {
    expect(visibleTermTaxonomies(["entry:post:edit_own"], source)).toEqual([]);
  });
});

describe("findSettingsPageByName + visibleSettingsPages + findSettingsGroupByName + groupsForSettingsPage", () => {
  const source: PlumixManifest = {
    settingsGroups: [
      {
        name: "identity",
        label: "Site identity",
        fields: [
          {
            key: "site_title",
            label: "Site title",
            type: "string",
            inputType: "text",
          },
          {
            key: "site_description",
            label: "Tagline",
            type: "string",
            inputType: "textarea",
          },
        ],
      },
      {
        name: "contact",
        label: "Contact",
        fields: [
          {
            key: "admin_email",
            label: "Admin email",
            type: "string",
            inputType: "email",
          },
        ],
      },
    ],
    settingsPages: [
      {
        name: "general",
        label: "General",
        groups: ["identity", "contact"],
      },
      {
        name: "billing",
        label: "Billing",
        groups: [],
      },
    ],
  };

  test("findSettingsPageByName returns the matching page", () => {
    expect(findSettingsPageByName("general", source)?.label).toBe("General");
  });

  test("findSettingsPageByName returns undefined when missing", () => {
    expect(findSettingsPageByName("mystery", source)).toBeUndefined();
  });

  test("visibleSettingsPages returns every page when caller has settings:manage", () => {
    expect(
      visibleSettingsPages(["settings:manage"], source).map((p) => p.name),
    ).toEqual(["general", "billing"]);
  });

  test("visibleSettingsPages returns empty when caller lacks settings:manage", () => {
    expect(visibleSettingsPages(["entry:post:edit_own"], source)).toEqual([]);
    expect(visibleSettingsPages([], source)).toEqual([]);
  });

  test("findSettingsGroupByName resolves a group by name", () => {
    expect(findSettingsGroupByName("identity", source)?.label).toBe(
      "Site identity",
    );
    expect(findSettingsGroupByName("mystery", source)).toBeUndefined();
  });

  test("groupsForSettingsPage resolves each reference to its group entry", () => {
    const page = findSettingsPageByName("general", source);
    expect(page).toBeDefined();
    if (!page) return;
    const groups = groupsForSettingsPage(page, source);
    expect(groups.map((g) => g.name)).toEqual(["identity", "contact"]);
  });

  test("groupsForSettingsPage silently skips unresolved refs", () => {
    const orphan: SettingsPageManifestEntry = {
      name: "orphan",
      label: "Orphan",
      groups: ["identity", "nonexistent"],
    };
    expect(groupsForSettingsPage(orphan, source).map((g) => g.name)).toEqual([
      "identity",
    ]);
  });
});

describe("visibleDashboardWidgets", () => {
  const source: PlumixManifest = {
    dashboardWidgets: [
      { id: "a:open", title: "Open", component: "Open" },
      {
        id: "a:gated",
        title: "Gated",
        capability: "secret:read",
        component: "Gated",
      },
    ],
  };

  test("returns ungated widgets plus gated ones the caller can access", () => {
    expect(
      visibleDashboardWidgets(["secret:read"], source).map((w) => w.id),
    ).toEqual(["a:open", "a:gated"]);
  });

  test("hides a gated widget when the caller lacks its capability", () => {
    expect(visibleDashboardWidgets([], source).map((w) => w.id)).toEqual([
      "a:open",
    ]);
  });
});

describe("getPatterns", () => {
  test("parseManifest carries the patterns slice through normalization", () => {
    const text = JSON.stringify({
      patterns: [
        {
          name: "starter/hero",
          title: "Hero",
          category: "hero",
          content: [],
        },
        {
          name: "starter/cta",
          title: "CTA",
          category: "cta",
          content: [],
        },
      ],
    });

    expect(parseManifest(text).patterns).toEqual([
      { name: "starter/hero", title: "Hero", category: "hero", content: [] },
      { name: "starter/cta", title: "CTA", category: "cta", content: [] },
    ]);
  });

  test("getPatterns returns the manifest patterns list, defaulting to empty", () => {
    expect(getPatterns({ patterns: [] })).toEqual([]);
    expect(getPatterns({})).toEqual([]);

    const heroEntry = {
      name: "x/h",
      title: "Hero",
      category: "hero" as const,
      content: [],
    };
    expect(getPatterns({ patterns: [heroEntry] })).toEqual([heroEntry]);
  });
});

describe("getAllowedBlocks", () => {
  test("reads the blocks the theme allows from the manifest payload", () => {
    const manifest = parseManifest(
      JSON.stringify({ allowedBlocks: ["core/rich-text"] }),
    );

    expect(getAllowedBlocks(manifest)).toEqual(["core/rich-text"]);
  });

  test("allows every block when the manifest is silent", () => {
    expect(getAllowedBlocks({})).toBeUndefined();
  });
});

describe("hasAuthorRoutes", () => {
  test("keeps author routes where the site left them on", () => {
    expect(hasAuthorRoutes({ frameworkRoutes: { author: true } })).toBe(true);
  });

  test("drops author routes where the site turned them off", () => {
    expect(hasAuthorRoutes({ frameworkRoutes: { author: false } })).toBe(false);
  });

  test("keeps author routes when the manifest is silent", () => {
    expect(hasAuthorRoutes({})).toBe(true);
  });
});

describe("getConfiguredSlots", () => {
  test("reports every slot unconfigured when the manifest names none", () => {
    expect(getConfiguredSlots({})).toEqual({
      storage: false,
      imageDelivery: false,
      kv: false,
      cdn: false,
      mailer: false,
    });
  });
});
