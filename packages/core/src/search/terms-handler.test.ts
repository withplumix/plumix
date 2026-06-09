import { describe, expect, test } from "vitest";

import type { AppContext } from "../context/app.js";
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
});
