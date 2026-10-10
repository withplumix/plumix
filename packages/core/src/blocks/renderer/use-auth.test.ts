import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

describe("useAuth", () => {
  test("the module carries no `use client` directive", () => {
    // A directive would make the island transform shim `useAuth` into a
    // component. The transform accepts one below leading comments, so strip
    // those rather than anchoring at byte zero.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "use-auth.ts"), "utf8");
    const body = source.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
    expect(body).not.toMatch(/^["']use client["']/);
  });
});
