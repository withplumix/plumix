// Run with: node --test .github/scripts/provenance-sweep.test.mjs
// Uses Node's built-in test runner: this is repo-root ops code that lives
// outside any workspace package, so it has no access to the per-package vitest.
import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { collectUnaccounted } from "./provenance-sweep.mjs";

// The manifest shape the sweep derives from the root NOTICE: which upstreams
// have a *copied/adapted code* entry, and which files/dirs that entry covers.
const manifest = {
  copiedUpstreams: ["Astro", "shadcn/ui", "shadcn", "Nuxt", "emdash"],
  noticeCoveredFiles: [
    "packages/blocks/src/serialize.ts",
    "packages/admin-ui/src/", // folder-level entry
  ],
};

describe("collectUnaccounted", () => {
  test("reports a copied-code marker whose file is not in the NOTICE", () => {
    const markers = [
      {
        file: "packages/blocks/src/island-element.ts",
        text: "Port of Astro's astro-island.ts",
      },
    ];
    const out = collectUnaccounted(markers, manifest);
    assert.equal(out.length, 1);
    assert.equal(out[0].file, "packages/blocks/src/island-element.ts");
  });

  test("stays clean when the copied-code file is listed in the NOTICE", () => {
    const markers = [
      {
        file: "packages/blocks/src/serialize.ts",
        text: "Port of Astro's prop serializer",
      },
    ];
    assert.equal(collectUnaccounted(markers, manifest).length, 0);
  });

  test("stays clean for a file under a folder-level NOTICE entry", () => {
    const markers = [
      {
        file: "packages/admin-ui/src/button.tsx",
        text: "Vendored shadcn/ui Button primitive",
      },
    ];
    assert.equal(collectUnaccounted(markers, manifest).length, 0);
  });

  test("never reports GPL WordPress behavioural parity as code derivation", () => {
    const markers = [
      {
        file: "packages/admin/src/components/taxonomy/tree.ts",
        text: "WordPress renders hierarchical terms; behavioural parity only",
      },
      {
        file: "packages/admin/src/x.ts",
        text: "adapted from WordPress's bulk-actions model",
      },
    ];
    assert.equal(collectUnaccounted(markers, manifest).length, 0);
  });

  test("does not report an idea-level borrow", () => {
    const markers = [
      {
        file: "packages/core/src/debug-bar/highlight-sql.ts",
        text: "idea borrowed from drizzle-query-logger",
      },
    ];
    assert.equal(collectUnaccounted(markers, manifest).length, 0);
  });

  test("does not report a contrast mention (upstream named, but not derived from)", () => {
    const markers = [
      {
        file: "packages/blocks/src/island-props.ts",
        text: "a plumix-specific lever Astro/Nuxt lack. Defaults are derived from the block registry",
      },
    ];
    assert.equal(collectUnaccounted(markers, manifest).length, 0);
  });

  test("does not report a re-export barrel that merely describes vendored code", () => {
    const noBareShadcn = {
      copiedUpstreams: ["Astro", "shadcn/ui", "Nuxt", "emdash"],
      noticeCoveredFiles: ["packages/admin-ui/src/"],
    };
    const markers = [
      {
        file: "packages/plumix/src/admin/ui.ts",
        text: "Re-exports the shared shadcn/ui primitives. These are vendored shadcn components we own and edit",
      },
    ];
    assert.equal(collectUnaccounted(markers, noBareShadcn).length, 0);
  });

  test("does not report a dependency-divergence note", () => {
    const markers = [
      {
        file: "packages/core/src/auth/passkey/register.ts",
        text: "oslojs's encodeSEC1Uncompressed left-aligns Y; reimplement per RFC 5480",
      },
    ];
    assert.equal(collectUnaccounted(markers, manifest).length, 0);
  });
});
