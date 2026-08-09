import { describe, expect, test } from "vitest";

import type { ScannerFs } from "./island-transform.js";
import {
  findUseClientIslands,
  scanUserSources,
  SERIALIZE_VIRTUAL_ID,
  transformUseClientModule,
} from "./island-transform.js";

function fixtureFs(
  files: Record<string, string>,
  options: {
    readonly dirs?: readonly string[];
    /** `linkPath → realTarget` mapping for symlinks. Reads/lists at linkPath transparently resolve to realTarget. */
    readonly links?: Readonly<Record<string, string>>;
  } = {},
): ScannerFs {
  const dirs = options.dirs ?? [];
  const links = options.links ?? {};
  const dirSet = new Set<string>(dirs);
  for (const path of Object.keys(files)) {
    let cur = "/";
    for (const part of path.split("/").filter(Boolean).slice(0, -1)) {
      cur = cur === "/" ? `/${part}` : `${cur}/${part}`;
      dirSet.add(cur);
    }
  }
  for (const linkPath of Object.keys(links)) {
    let cur = "/";
    for (const part of linkPath.split("/").filter(Boolean).slice(0, -1)) {
      cur = cur === "/" ? `/${part}` : `${cur}/${part}`;
      dirSet.add(cur);
    }
  }
  const resolveSymlinks = (path: string): string => {
    for (const [linkPath, target] of Object.entries(links)) {
      if (path === linkPath) return target;
      if (path.startsWith(`${linkPath}/`)) {
        return `${target}${path.slice(linkPath.length)}`;
      }
    }
    return path;
  };
  const childrenOf = (dirPath: string) => {
    const out: { name: string; isDirectory: boolean }[] = [];
    const prefix = dirPath === "/" ? "/" : `${dirPath}/`;
    const seen = new Set<string>();
    for (const path of Object.keys(files)) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const next = rest.split("/")[0];
      if (!next || seen.has(next)) continue;
      seen.add(next);
      const fullChild = `${prefix}${next}`;
      out.push({ name: next, isDirectory: dirSet.has(fullChild) });
    }
    for (const linkPath of Object.keys(links)) {
      if (!linkPath.startsWith(prefix)) continue;
      const rest = linkPath.slice(prefix.length);
      const next = rest.split("/")[0];
      if (!next || seen.has(next)) continue;
      seen.add(next);
      const fullChild = `${prefix}${next}`;
      // A symlink entry reports `isDirectory: false` even when it targets
      // a directory — `lstat`/`Dirent` describe the link itself. Only an
      // intermediate real dir (e.g. the `@scope` folder above a link) is
      // a directory. Modelling this is what surfaces the symlink walk bug.
      out.push({
        name: next,
        isDirectory: !Object.prototype.hasOwnProperty.call(links, fullChild),
      });
    }
    return out;
  };
  return {
    readDir: (path) => {
      const resolved = resolveSymlinks(path);
      if (!dirSet.has(resolved) && resolved !== "/") {
        throw new Error(`no such dir: ${path}`);
      }
      return childrenOf(resolved);
    },
    readFile: (path) => {
      const resolved = resolveSymlinks(path);
      const content = files[resolved];
      if (content === undefined) throw new Error(`no such file: ${path}`);
      return content;
    },
    isSymlink: (path) => Object.prototype.hasOwnProperty.call(links, path),
    realPath: (path) => resolveSymlinks(path),
  };
}

describe("findUseClientIslands", () => {
  test("extracts a single named export from a `use client` module", () => {
    const source = `
      "use client";
      import { useState } from "react";
      export function Counter() {
        const [n, setN] = useState(0);
        return <button onClick={() => setN(n + 1)}>{n}</button>;
      }
    `;
    const islands = findUseClientIslands(source);
    expect(islands).toEqual([{ exportName: "Counter" }]);
  });

  test("returns [] when the directive isn't the first statement", () => {
    // Match React 19 / RSC semantics — the directive must lead.
    const source = `
      const sentinel = 42;
      "use client";
      export function Counter() { return null; }
    `;
    expect(findUseClientIslands(source)).toEqual([]);
  });

  test("returns [] when the file lacks the directive entirely", () => {
    const source = `
      import { useState } from "react";
      export function NotAnIsland() { return null; }
    `;
    expect(findUseClientIslands(source)).toEqual([]);
  });

  test("returns one finding per named function/const/class export", () => {
    const source = `
      "use client";
      export function A() { return null; }
      export const B = () => null;
      export class C {}
    `;
    const islands = findUseClientIslands(source);
    expect(islands.map((i) => i.exportName)).toEqual(["A", "B", "C"]);
  });

  test("includes the default export, encoded as exportName='default'", () => {
    const source = `
      "use client";
      export default function MyComponent() { return null; }
    `;
    const islands = findUseClientIslands(source);
    expect(islands).toEqual([{ exportName: "default" }]);
  });

  test("drops exports whose name is a prototype-pollution key", () => {
    // `mod["__proto__"]` would resolve to Object.prototype on the client
    // side and `createRoot(...).render(<Component />)` would crash.
    // Match the existing `FORBIDDEN_EXPORT_KEYS` guard from defineBlock
    // discovery.
    const source = `
      "use client";
      export const __proto__ = () => null;
      export const constructor = () => null;
      export const Counter = () => null;
    `;
    const islands = findUseClientIslands(source);
    expect(islands.map((i) => i.exportName)).toEqual(["Counter"]);
  });

  test("ignores comments and leading whitespace before the directive", () => {
    const source = `
      // Copyright header
      /* multiline note */
      "use client";
      export function Counter() { return null; }
    `;
    expect(findUseClientIslands(source)).toEqual([{ exportName: "Counter" }]);
  });
});

describe("transformUseClientModule", () => {
  test("rewrites a `use client` module to a shim that delegates to IslandShim", () => {
    const source = `
      "use client";
      import { useState } from "react";
      export function Counter() {
        const [n, setN] = useState(0);
        return <button onClick={() => setN(n + 1)}>{n}</button>;
      }
    `;
    const result = transformUseClientModule(source, "/abs/path/Counter.tsx", {
      chunkUrl: "/src/Counter.tsx",
    });
    expect(result).not.toBeNull();
    if (!result) return;
    const out = result.code;
    // Re-imports the original file via the ?plumix-orig query so the
    // shim doesn't recursively re-trigger this transform.
    expect(out).toContain(`from "/abs/path/Counter.tsx?plumix-orig"`);
    // Re-exports every name the original exports, but as a shim.
    expect(out).toMatch(/export\s+function\s+Counter\s*\(/);
    // The shim hands the original component + wiring to IslandShim, which
    // owns the boundary decision, prop split, serialization, and the
    // `<plumix-island>` shape. The transform only supplies static wiring.
    expect(out).toContain(`Component: __orig["Counter"]`);
    expect(out).toContain(`exportName: "Counter"`);
    expect(out).toContain(`chunkUrl: "/src/Counter.tsx"`);
    // The raw props flow straight through — the shim no longer bakes the
    // split/serialize/attribute logic inline.
    expect(out).toContain("props");
  });

  test("wraps the default export as a delegating shim", () => {
    const source = `
      "use client";
      export default function MyComponent() { return null; }
    `;
    const result = transformUseClientModule(source, "/abs/MyComponent.tsx", {
      chunkUrl: "/MyComponent.tsx",
    });
    expect(result?.code).toContain("export default function PlumixIsland(");
    expect(result?.code).toContain(`Component: __orig["default"]`);
    expect(result?.code).toContain(`exportName: "default"`);
  });

  test("imports IslandShim from the virtual module, not plumix/blocks directly", () => {
    // A "use client" island in `@plumix/blocks` itself can't resolve the
    // public `plumix/blocks` specifier (cycle + pnpm strictness), so the
    // shim sources `IslandShim` from the virtual module the plugin resolves
    // at the project root.
    const source = `
      "use client";
      export function Widget() { return null; }
    `;
    const result = transformUseClientModule(source, "/Widget.tsx", {
      chunkUrl: "/Widget.tsx",
    });
    expect(result?.code).toContain(`from "${SERIALIZE_VIRTUAL_ID}"`);
    expect(result?.code).toContain("IslandShim");
    expect(result?.code).not.toContain(`from "plumix/blocks"`);
  });

  test("returns null for files without the directive (no-op transform)", () => {
    const source = `
      import { useState } from "react";
      export function NotAnIsland() { return null; }
    `;
    const result = transformUseClientModule(source, "/x.tsx", {
      chunkUrl: "/x.tsx",
    });
    expect(result).toBeNull();
  });
});

describe("scanUserSources", () => {
  test("surfaces every export of a `use client` module", () => {
    const fs = fixtureFs({
      "/app/src/counter.tsx": `
        "use client";
        export function Counter() { return null; }
        export function Doubler() { return null; }
      `,
    });
    const islands = scanUserSources("/app", fs);
    expect(islands).toEqual([
      { sourcePath: "/app/src/counter.tsx", exportName: "Counter" },
      { sourcePath: "/app/src/counter.tsx", exportName: "Doubler" },
    ]);
  });

  test("skips node_modules, .plumix, dist, .wrangler, .git, .turbo", () => {
    const fs = fixtureFs({
      "/app/src/a.tsx": `"use client"; export function A() { return null; }`,
      "/app/node_modules/pkg/b.tsx": `"use client"; export function B() { return null; }`,
      "/app/.plumix/c.tsx": `"use client"; export function C() { return null; }`,
      "/app/dist/d.tsx": `"use client"; export function D() { return null; }`,
    });
    const islands = scanUserSources("/app", fs);
    expect(islands.map((i) => i.exportName)).toEqual(["A"]);
  });

  test("aggregates findings across multiple files in subdirectories", () => {
    const fs = fixtureFs({
      "/app/src/a/A.tsx": `"use client"; export function A() { return null; }`,
      "/app/src/b/B.tsx": `"use client"; export function B() { return null; }`,
    });
    const islands = scanUserSources("/app", fs);
    expect(islands).toHaveLength(2);
    expect(new Set(islands.map((i) => i.sourcePath))).toEqual(
      new Set(["/app/src/a/A.tsx", "/app/src/b/B.tsx"]),
    );
  });

  test("does NOT follow symlinks that land in another node_modules (pnpm store)", () => {
    // pnpm wires every dep — including published — as a symlink; only
    // workspace targets realpath outside node_modules.
    const fs = fixtureFs(
      {
        "/app/src/page.tsx": `import {} from "lodash";`,
        "/app/node_modules/.pnpm/lodash@4/node_modules/lodash/i.tsx": `"use client"; export function Bad() { return null; }`,
      },
      {
        links: {
          "/app/node_modules/lodash":
            "/app/node_modules/.pnpm/lodash@4/node_modules/lodash",
        },
      },
    );
    expect(scanUserSources("/app", fs)).toEqual([]);
  });

  test("descends into symlinked workspace packages under node_modules", () => {
    const fs = fixtureFs(
      {
        "/app/src/page.tsx": `import { CopyLink } from "@plumix/theme-starter";`,
        "/workspace/themes/starter/src/islands/CopyLink.tsx": `"use client"; export function CopyLink() { return null; }`,
      },
      {
        links: {
          "/app/node_modules/@plumix/theme-starter":
            "/workspace/themes/starter",
        },
      },
    );
    const islands = scanUserSources("/app", fs);
    expect(islands).toEqual([
      {
        sourcePath: "/workspace/themes/starter/src/islands/CopyLink.tsx",
        exportName: "CopyLink",
      },
    ]);
  });

  test("ignores files that don't mention `use client` (cheap pre-filter)", () => {
    const reads: string[] = [];
    const baseFs = fixtureFs({
      "/app/src/island.tsx": `"use client"; export function Foo() { return null; }`,
      "/app/src/db.ts": "export const db = {};",
    });
    const wrappedFs: ScannerFs = {
      ...baseFs,
      readFile: (path) => {
        reads.push(path);
        return baseFs.readFile(path);
      },
    };
    const islands = scanUserSources("/app", wrappedFs);
    expect(islands).toHaveLength(1);
    // db.ts gets one read for the pre-filter; AST parse is skipped.
    expect(reads).toContain("/app/src/island.tsx");
  });
});
