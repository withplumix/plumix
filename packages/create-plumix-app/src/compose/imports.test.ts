import { describe, expect, it } from "vitest";

import { mergeImports } from "./imports.js";

describe("mergeImports", () => {
  it("merges named imports from the same module into one statement", () => {
    expect(
      mergeImports([
        'import { cloudflare, d1 } from "@plumix/runtime-cloudflare";',
        'import { media } from "@plumix/plugin-media";',
        'import { r2 } from "@plumix/runtime-cloudflare";',
      ]),
    ).toEqual([
      'import { cloudflare, d1, r2 } from "@plumix/runtime-cloudflare";',
      'import { media } from "@plumix/plugin-media";',
    ]);
  });

  it("dedupes and sorts symbols, keeping first-seen module order", () => {
    expect(
      mergeImports([
        'import { images, r2 } from "@plumix/runtime-cloudflare";',
        'import { r2 } from "@plumix/runtime-cloudflare";',
      ]),
    ).toEqual(['import { images, r2 } from "@plumix/runtime-cloudflare";']);
  });

  it("passes a statement it cannot parse through unchanged", () => {
    expect(mergeImports(['import "./styles.css";'])).toEqual([
      'import "./styles.css";',
    ]);
  });
});
