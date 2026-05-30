import { describe, expect, test } from "vitest";

import { plumix } from "./index.js";

describe("plumix vite plugin — SSR transform on .js islands", () => {
  test("a .js `use client` module is rewritten to the island wrapper", async () => {
    const plugin = plumix();
    const code = `"use client";
import { useState } from "react";
export function CopyLink() {
  const [copied, setCopied] = useState(false);
  return null;
}
`;
    const id = "/abs/packages/themes/starter/dist/islands/CopyLink.js";

    // Vite typing: `transform` is a function-or-object union; cast through
    // unknown so the test fails loudly if the shape ever changes.
    const transform = plugin.transform as unknown as (
      code: string,
      id: string,
      options: { ssr: boolean },
    ) => unknown;
    const result = await transform(code, id, { ssr: true });

    if (typeof result !== "object" || result === null || !("code" in result)) {
      throw new Error("transform returned unexpected shape");
    }
    expect(result.code).toContain("plumix-island");
  });
});
