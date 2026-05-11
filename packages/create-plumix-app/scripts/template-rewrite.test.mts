import { describe, expect, test } from "vitest";

import {
  addWorkspacePath,
  rewriteTemplatePackageJson,
} from "./template-rewrite.mjs";

describe("rewriteTemplatePackageJson", () => {
  const baseInput = `{
  "name": "plumix-starter",
  "dependencies": {
    "plumix": "^0.1.0",
    "@plumix/runtime-cloudflare": "^0.1.0",
    "drizzle-orm": "^0.45.2"
  },
  "devDependencies": {
    "typescript": "^6.0.3",
    "@plumix/vitest-config": "workspace:*"
  }
}
`;

  test("rewrites listed deps and leaves the rest untouched", () => {
    const out = rewriteTemplatePackageJson(baseInput, {
      plumix: "workspace:*",
      "@plumix/runtime-cloudflare": "workspace:*",
      "drizzle-orm": "catalog:",
    });

    const parsed = JSON.parse(out) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(parsed.dependencies.plumix).toBe("workspace:*");
    expect(parsed.dependencies["@plumix/runtime-cloudflare"]).toBe(
      "workspace:*",
    );
    expect(parsed.dependencies["drizzle-orm"]).toBe("catalog:");
    expect(parsed.devDependencies.typescript).toBe("^6.0.3");
    expect(parsed.devDependencies["@plumix/vitest-config"]).toBe("workspace:*");
  });

  test("rewrites in devDependencies too when a key sits there", () => {
    const input = `{
  "name": "x",
  "devDependencies": {
    "drizzle-kit": "^0.31.10"
  }
}
`;
    const out = rewriteTemplatePackageJson(input, {
      "drizzle-kit": "catalog:",
    });
    const parsed = JSON.parse(out) as {
      devDependencies: Record<string, string>;
    };
    expect(parsed.devDependencies["drizzle-kit"]).toBe("catalog:");
  });

  test("ignores override keys that don't appear in deps", () => {
    const input = `{
  "name": "x",
  "dependencies": { "plumix": "^0.1.0" }
}
`;
    const out = rewriteTemplatePackageJson(input, {
      plumix: "workspace:*",
      "ghost-package": "workspace:*",
    });
    const parsed = JSON.parse(out) as {
      dependencies: Record<string, string>;
    };
    expect(parsed.dependencies.plumix).toBe("workspace:*");
    expect(parsed.dependencies["ghost-package"]).toBeUndefined();
  });

  test("handles a package.json with no dependencies field", () => {
    const input = `{ "name": "x" }
`;
    expect(() =>
      rewriteTemplatePackageJson(input, { plumix: "workspace:*" }),
    ).not.toThrow();
  });

  test("output ends with a trailing newline (POSIX)", () => {
    const out = rewriteTemplatePackageJson(baseInput, {
      plumix: "workspace:*",
    });
    expect(out.endsWith("\n")).toBe(true);
  });

  test("output uses 2-space indentation", () => {
    const out = rewriteTemplatePackageJson(baseInput, {
      plumix: "workspace:*",
    });
    // First nested line under the root object — 2 spaces of indent.
    const firstKeyLine = out
      .split("\n")
      .find((line) => line.includes('"name"'));
    expect(firstKeyLine?.startsWith("  ")).toBe(true);
    expect(firstKeyLine?.startsWith("   ")).toBe(false);
  });
});

describe("addWorkspacePath", () => {
  const baseYaml = `packages:
  - "packages/*"
  - "packages/runtimes/*"
  - "examples/*"

catalog:
  drizzle-orm: ^0.45.2
`;

  test("inserts the new path as the last entry under packages:", () => {
    const out = addWorkspacePath(
      baseYaml,
      "packages/create-plumix-app/templates/*",
    );
    expect(out).toContain('- "packages/create-plumix-app/templates/*"');
    // Catalog section untouched.
    expect(out).toContain("catalog:");
    expect(out).toContain("drizzle-orm: ^0.45.2");
  });

  test("is idempotent — adding the same path twice yields the same yaml", () => {
    const once = addWorkspacePath(baseYaml, "templates/*");
    const twice = addWorkspacePath(once, "templates/*");
    expect(twice).toBe(once);
  });

  test("preserves the original packages: list ordering and content", () => {
    const out = addWorkspacePath(baseYaml, "templates/*");
    expect(out).toContain('- "packages/*"');
    expect(out).toContain('- "packages/runtimes/*"');
    expect(out).toContain('- "examples/*"');
  });

  test("adds the new path after the last existing entry, not in the middle", () => {
    const out = addWorkspacePath(baseYaml, "templates/*");
    const lines = out.split("\n");
    const examples = lines.findIndex((l) => l.includes('"examples/*"'));
    const templates = lines.findIndex((l) => l.includes('"templates/*"'));
    expect(templates).toBeGreaterThan(examples);
  });

  test("preserves yaml outside the packages: section verbatim", () => {
    const out = addWorkspacePath(baseYaml, "templates/*");
    // Everything from `catalog:` onwards should be byte-identical.
    const tailFrom = (s: string) => s.slice(s.indexOf("catalog:"));
    expect(tailFrom(out)).toBe(tailFrom(baseYaml));
  });
});
