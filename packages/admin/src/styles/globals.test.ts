import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

/**
 * `plumix-plugins` sits above base/components so preflight doesn't strip
 * plugin styles, below `utilities` so a plugin `.hidden` can't beat
 * `md:block`.
 */
const css = readFileSync(
  resolve(process.cwd(), "src/styles/globals.css"),
  "utf8",
);

describe("admin globals.css cascade layers", () => {
  test("orders plumix-plugins above base/components but below utilities, before the tailwind import", () => {
    const decl = /@layer\s+([a-z0-9 ,_-]+);/i.exec(css);
    if (decl === null) {
      throw new Error("globals.css declares no @layer order");
    }
    const layers = (decl[1] ?? "").split(",").map((s) => s.trim());

    // Every layer must be present (indexOf returns -1 when absent, which
    // would make the ordering comparisons below pass vacuously).
    for (const name of ["base", "components", "plumix-plugins", "utilities"]) {
      expect(layers).toContain(name);
    }
    const i = (name: string) => layers.indexOf(name);
    expect(i("plumix-plugins")).toBeGreaterThan(i("base"));
    expect(i("plumix-plugins")).toBeGreaterThan(i("components"));
    expect(i("plumix-plugins")).toBeLessThan(i("utilities"));

    expect(decl.index).toBeLessThan(css.indexOf('@import "tailwindcss"'));
  });
});
