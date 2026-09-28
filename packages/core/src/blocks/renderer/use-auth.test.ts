import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

describe("useAuth", () => {
  test("the module carries no `use client` directive", () => {
    // A directive here would make the Vite island transform replace `useAuth`
    // with a component shim, so the hook would return a React element during
    // SSR and every destructured field would read `undefined`. The transform
    // accepts a directive below leading comments, so strip those first rather
    // than anchoring at byte zero.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "use-auth.ts"), "utf8");
    const body = source.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
    expect(body).not.toMatch(/^["']use client["']/);
  });
});
