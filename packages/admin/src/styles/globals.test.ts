import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

// Contract with the plugin CSS sidecar (packages/plumix/src/vite/
// admin-plugin-bundle.ts): it emits plugin utilities into a `plumix-plugins`
// cascade layer. This file must order that layer ABOVE base/components (so
// Tailwind's preflight doesn't strip plugin-page styling) but BELOW the
// admin's own `utilities` (so a plugin re-emitting `.hidden` can't beat the
// admin's responsive `md:block` and collapse the sidebar) — and declare it
// before the Tailwind import so the cross-stylesheet layer order is fixed.
// vitest runs with cwd at the package root.
const css = readFileSync(
  resolve(process.cwd(), "src/styles/globals.css"),
  "utf8",
);

describe("admin globals.css cascade layers", () => {
  test("orders plumix-plugins above base/components but below utilities, before the tailwind import", () => {
    const decl = /@layer\s+([a-z0-9 ,_-]+);/i.exec(css);
    expect(decl).not.toBeNull();
    const layers = (decl?.[1] ?? "").split(",").map((s) => s.trim());

    // Every layer must be present (indexOf returns -1 when absent, which
    // would make the ordering comparisons below pass vacuously).
    for (const name of ["base", "components", "plumix-plugins", "utilities"]) {
      expect(layers).toContain(name);
    }
    const i = (name: string) => layers.indexOf(name);
    expect(i("plumix-plugins")).toBeGreaterThan(i("base"));
    expect(i("plumix-plugins")).toBeGreaterThan(i("components"));
    expect(i("plumix-plugins")).toBeLessThan(i("utilities"));

    expect(decl!.index).toBeLessThan(css.indexOf('@import "tailwindcss"'));
  });
});
