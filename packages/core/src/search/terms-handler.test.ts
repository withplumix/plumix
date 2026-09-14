import { describe, expect, test } from "vitest";

import { createPluginRegistry } from "../plugin/manifest.js";
import { toRegisteredTermTaxonomy } from "../plugin/registry.js";
import { termFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { termsSearchHandler } from "./terms-handler.js";

describe("termsSearchHandler", () => {
  test("omits taxonomies the caller cannot read", async () => {
    const db = await createTestDb();
    const plugins = createPluginRegistry();
    plugins.termTaxonomies.set(
      "category",
      toRegisteredTermTaxonomy(
        "category",
        { label: { id: "c", message: "Categories" } },
        "test",
      ),
    );
    // A matching term, so only the capability check can empty the result.
    await termFactory
      .transient({ db })
      .create({ taxonomy: "category", name: "x", slug: "x" });
    const ctx = { db, plugins, auth: { can: () => false } };

    expect(await termsSearchHandler({ query: "x", limit: 5 }, ctx)).toEqual([]);
  });

  test("finds a term whose taxonomy is excluded from public search", async () => {
    // The palette answers an editor, who searches what they can read — not a
    // visitor, whose reach `excludeFromSearch` bounds. A nav-menu taxonomy is
    // hidden from the site and still has to be findable here.
    const db = await createTestDb();
    const plugins = createPluginRegistry();
    // Both ways a taxonomy is excluded: derived from `isPublic`, and declared
    // outright on one that is public.
    plugins.termTaxonomies.set(
      "nav-menu",
      toRegisteredTermTaxonomy(
        "nav-menu",
        { label: "Menus", isPublic: false },
        "menu",
      ),
    );
    plugins.termTaxonomies.set(
      "internal",
      toRegisteredTermTaxonomy(
        "internal",
        { label: "Internal", excludeFromSearch: true },
        "test",
      ),
    );
    await termFactory
      .transient({ db })
      .create({ taxonomy: "nav-menu", name: "Footer", slug: "footer" });
    await termFactory
      .transient({ db })
      .create({ taxonomy: "internal", name: "Footer notes", slug: "notes" });
    const ctx = { db, plugins, auth: { can: () => true } };

    const groups = await termsSearchHandler({ query: "footer", limit: 5 }, ctx);

    expect(groups.map((group) => group.key)).toEqual([
      "term:nav-menu",
      "term:internal",
    ]);
  });
});
