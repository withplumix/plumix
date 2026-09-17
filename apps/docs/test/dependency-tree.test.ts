import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import type { ResolvedCopy } from "./dependency-tree";
import { parseResolvedCopies, resolvedCopiesOf } from "./dependency-tree";

const DOCS_ROOT = fileURLToPath(new URL("..", import.meta.url));
const GATED_PACKAGES = ["satteri", "@astrojs/markdown-satteri"];

describe("parseResolvedCopies", () => {
  it("reports one entry per distinct resolved copy", () => {
    const whyOutput = JSON.stringify([
      {
        name: "satteri",
        version: "0.10.5",
        path: "/repo/node_modules/.pnpm/satteri@0.10.5/node_modules/satteri",
      },
      {
        name: "satteri",
        version: "0.10.3",
        path: "/repo/node_modules/.pnpm/satteri@0.10.3/node_modules/satteri",
      },
    ]);

    expect(parseResolvedCopies(whyOutput)).toEqual([
      {
        version: "0.10.5",
        path: "/repo/node_modules/.pnpm/satteri@0.10.5/node_modules/satteri",
      },
      {
        version: "0.10.3",
        path: "/repo/node_modules/.pnpm/satteri@0.10.3/node_modules/satteri",
      },
    ]);
  });

  it("reports nothing for a package that resolves nowhere", () => {
    expect(parseResolvedCopies("[]")).toEqual([]);
  });

  it("reports two copies for a genuinely split tree", () => {
    const whyOutput = JSON.stringify([
      { name: "satteri", version: "0.10.5", path: "/repo/a/satteri" },
      { name: "satteri", version: "0.10.3", path: "/repo/b/satteri" },
    ]);

    expect(parseResolvedCopies(whyOutput)).toHaveLength(2);
  });
});

describe("the dependency tree stays on a single satteri copy", () => {
  const resolved = new Map<string, ResolvedCopy[]>();

  beforeAll(async () => {
    const results = await Promise.all(
      GATED_PACKAGES.map((packageName) =>
        resolvedCopiesOf(packageName, DOCS_ROOT),
      ),
    );
    GATED_PACKAGES.forEach((packageName, index) => {
      resolved.set(packageName, results[index]);
    });
  });

  it.each(GATED_PACKAGES)("%s resolves to a single copy", (packageName) => {
    expect(resolved.get(packageName)).toHaveLength(1);
  });
});
