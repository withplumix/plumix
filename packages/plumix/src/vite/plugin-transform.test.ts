import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { plumix } from "./index.js";

describe("plumix vite plugin — SSR transform on .js islands", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "plumix-transform-"));
    writeFileSync(
      join(dir, "plumix.config.mjs"),
      `export default {
        runtime: { name: 'x', handler: {}, generateEntry: () => '' },
        database: { kind: 'x' },
        auth: { passkey: {} },
      };`,
    );
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("a .js `use client` module is rewritten to the island wrapper", async () => {
    const [plugin] = plumix({ configFile: join(dir, "plumix.config.mjs") });
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
    // The .js module is rewritten to a shim that delegates to IslandShim
    // (which owns the `<plumix-island>` shape at render time).
    expect(result.code).toContain("__IslandShim");
    expect(result.code).toContain(`Component: __orig["CopyLink"]`);
  });
});
