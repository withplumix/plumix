import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
import { createPluginRegistry } from "../plugin/manifest.js";
import { createTestContext } from "../test/context.js";
import { termFactory } from "../test/factories.js";
import { createTestDb } from "../test/harness.js";
import { termsSearchHandler } from "./terms-handler.js";

// The handler skips taxonomies the caller can't read before touching the
// db, so a denying `auth.can` short-circuits to no groups (no db needed).
describe("termsSearchHandler", () => {
  test("omits taxonomies the caller cannot read", async () => {
    const ctx = {
      auth: { can: () => false },
      plugins: {
        termTaxonomies: new Map([
          ["category", { label: { id: "c", message: "Categories" } }],
        ]),
      },
    } as unknown as AppContext;

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
    plugins.termTaxonomies.set("nav-menu", {
      name: "nav-menu",
      registeredBy: "menu",
      label: "Menus",
      isPublic: false,
    });
    plugins.termTaxonomies.set("internal", {
      name: "internal",
      registeredBy: "test",
      label: "Internal",
      excludeFromSearch: true,
    });
    await termFactory
      .transient({ db })
      .create({ taxonomy: "nav-menu", name: "Footer", slug: "footer" });
    await termFactory
      .transient({ db })
      .create({ taxonomy: "internal", name: "Footer notes", slug: "notes" });
    const ctx = {
      ...createTestContext({ db, plugins }),
      auth: { can: () => true },
    } as unknown as AppContext;

    const groups = await termsSearchHandler({ query: "footer", limit: 5 }, ctx);

    expect(groups.map((group) => group.key)).toEqual([
      "term:nav-menu",
      "term:internal",
    ]);
  });
});
