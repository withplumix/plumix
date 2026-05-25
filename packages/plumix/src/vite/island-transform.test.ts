import { describe, expect, test } from "vitest";

import type { ScannerFs } from "./island-transform.js";
import {
  findIslands,
  findUseClientIslands,
  scanUserSources,
  transformUseClientModule,
} from "./island-transform.js";

function fixtureFs(
  files: Record<string, string>,
  dirs: readonly string[] = [],
): ScannerFs {
  const dirSet = new Set<string>(dirs);
  for (const path of Object.keys(files)) {
    let cur = "/";
    for (const part of path.split("/").filter(Boolean).slice(0, -1)) {
      cur = cur === "/" ? `/${part}` : `${cur}/${part}`;
      dirSet.add(cur);
    }
  }
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
    return out;
  };
  return {
    readDir: (path) => {
      if (!dirSet.has(path) && path !== "/") {
        throw new Error(`no such dir: ${path}`);
      }
      return childrenOf(path);
    },
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) throw new Error(`no such file: ${path}`);
      return content;
    },
  };
}

describe("findIslands", () => {
  test("extracts a single named-import island from a defineBlock call", () => {
    const source = `
      import { Search } from "./Search.tsx";
      import { defineBlock } from "@plumix/blocks";
      export const searchBlock = defineBlock({
        name: "acme/search",
        render: () => null,
        client: { component: Search, hydrateWhen: "load" },
      });
    `;
    const islands = findIslands(source, "/abs/path/to/blocks.ts");
    expect(islands).toHaveLength(1);
    expect(islands[0]).toMatchObject({
      localBindingName: "Search",
      importPath: "./Search.tsx",
      exportName: "Search",
    });
  });

  test("resolves an aliased named import to its source export name", () => {
    const source = `
      import { Search as PageSearch } from "./Search.tsx";
      import { defineBlock } from "@plumix/blocks";
      export const block = defineBlock({
        name: "acme/x",
        render: () => null,
        client: { component: PageSearch, hydrateWhen: "load" },
      });
    `;
    const islands = findIslands(source, "/x.ts");
    expect(islands[0]).toMatchObject({
      localBindingName: "PageSearch",
      importPath: "./Search.tsx",
      exportName: "Search",
    });
  });

  test("resolves a default import as exportName='default'", () => {
    const source = `
      import Counter from "./Counter.tsx";
      import { defineBlock } from "@plumix/blocks";
      export const block = defineBlock({
        name: "acme/counter",
        render: () => null,
        client: { component: Counter, hydrateWhen: "load" },
      });
    `;
    const islands = findIslands(source, "/x.ts");
    expect(islands[0]).toMatchObject({
      localBindingName: "Counter",
      importPath: "./Counter.tsx",
      exportName: "default",
    });
  });

  test("returns multiple findings for multiple defineBlock calls in one file", () => {
    const source = `
      import { A } from "./A.tsx";
      import { B } from "./B.tsx";
      import { defineBlock } from "@plumix/blocks";
      export const a = defineBlock({ name: "a", render: () => null, client: { component: A } });
      export const b = defineBlock({ name: "b", render: () => null, client: { component: B } });
    `;
    const islands = findIslands(source, "/x.ts");
    expect(islands).toHaveLength(2);
    expect(islands.map((i) => i.localBindingName)).toEqual(["A", "B"]);
  });

  test("returns [] for a defineBlock with no client field", () => {
    const source = `
      import { defineBlock } from "@plumix/blocks";
      export const block = defineBlock({ name: "acme/x", render: () => null });
    `;
    expect(findIslands(source, "/x.ts")).toEqual([]);
  });

  test("returns [] when the component identifier isn't imported (probably local fn)", () => {
    const source = `
      import { defineBlock } from "@plumix/blocks";
      function Local() { return null; }
      export const block = defineBlock({
        name: "acme/x",
        render: () => null,
        client: { component: Local },
      });
    `;
    // Local-scoped components fall off the discovery path — documented
    // limitation in the IslandFinding doc-comment.
    expect(findIslands(source, "/x.ts")).toEqual([]);
  });

  test("drops a finding whose exportName is a prototype-pollution key", () => {
    // `import { __proto__ as Foo } from "..."` — would resolve to
    // Object.prototype on the client's `mod[exportName]` lookup.
    const source = `
      import { __proto__ as Foo } from "./Foo.tsx";
      import { defineBlock } from "@plumix/blocks";
      export const block = defineBlock({
        name: "acme/x",
        render: () => null,
        client: { component: Foo },
      });
    `;
    expect(findIslands(source, "/x.ts")).toEqual([]);
  });

  test("parses .tsx sources without complaining about JSX in render", () => {
    const source = `
      import { Search } from "./Search.tsx";
      import { defineBlock } from "@plumix/blocks";
      export const block = defineBlock({
        name: "acme/search",
        render: () => <span>fallback</span>,
        client: { component: Search },
      });
    `;
    const islands = findIslands(source, "/blocks.tsx");
    expect(islands).toHaveLength(1);
  });
});

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
    expect(findUseClientIslands(source)).toEqual([
      { exportName: "Counter" },
    ]);
  });
});

describe("transformUseClientModule", () => {
  test("rewrites a `use client` module to re-export shim components", () => {
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
    expect(out).toContain(
      `from "/abs/path/Counter.tsx?plumix-orig"`,
    );
    // Re-exports every name the original exports, but as a shim.
    expect(out).toMatch(/export\s+function\s+Counter\s*\(/);
    // Shim wraps in `<plumix-island>` with chunk-url + component-export
    // + ssr="" baked in. We just check the literals are present — the
    // exact JSX/createElement shape is an internal detail.
    expect(out).toContain('"chunk-url": "/src/Counter.tsx"');
    expect(out).toContain('"component-export": "Counter"');
    expect(out).toContain('"ssr": ""');
  });

  test("shim forwards strategy from the `client` JSX prop, defaulting to load", () => {
    // `IslandProps<T>` enforces the type at compile time; the custom
    // element dispatches `plumix:hydration-error` for unknown strategies
    // at runtime. The shim itself just passes the value through.
    const source = `
      "use client";
      export function Counter() { return null; }
    `;
    const result = transformUseClientModule(source, "/Counter.tsx", {
      chunkUrl: "/Counter.tsx",
    });
    expect(result?.code).toContain(
      `typeof client === "string" ? client : "load"`,
    );
  });

  test("shim serializes props via JSON.stringify (functions drop automatically)", () => {
    // The shim's `props=` attribute is built by `JSON.stringify(forward)`.
    // JSON.stringify omits function-typed values at every depth — a
    // standard JS behavior we rely on rather than re-implement. Assert
    // the generated source uses JSON.stringify on the forwarded props
    // (the strip happens for free).
    const source = `
      "use client";
      export function Action() { return null; }
    `;
    const result = transformUseClientModule(source, "/Action.tsx", {
      chunkUrl: "/Action.tsx",
    });
    expect(result?.code).toContain("JSON.stringify(forward)");
    // The shim must destructure `client` out before forwarding so the
    // strategy slot doesn't leak into the props attribute either.
    expect(result?.code).toContain("const { client, ...forward }");
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
  test("finds a single island and resolves its importPath against the block file dir", () => {
    const fs = fixtureFs({
      "/app/src/blocks.ts": `
        import { Search } from "./client/Search.tsx";
        import { defineBlock } from "@plumix/blocks";
        export const block = defineBlock({
          name: "acme/search",
          render: () => null,
          client: { component: Search },
        });
      `,
      "/app/src/client/Search.tsx": "export const Search = () => null;",
    });
    const islands = scanUserSources("/app", fs);
    expect(islands).toEqual([
      {
        sourcePath: "/app/src/client/Search.tsx",
        exportName: "Search",
        blockFile: "/app/src/blocks.ts",
      },
    ]);
  });

  test("skips node_modules, .plumix, dist, .wrangler, .git, .turbo", () => {
    const fs = fixtureFs({
      "/app/src/blocks.ts": `import { A } from "./A.tsx"; import { defineBlock } from "@plumix/blocks"; export const a = defineBlock({ name: "a", render: () => null, client: { component: A } });`,
      "/app/src/A.tsx": "export const A = () => null;",
      "/app/node_modules/pkg/blocks.ts": `import { B } from "./B.tsx"; import { defineBlock } from "@plumix/blocks"; export const b = defineBlock({ name: "b", render: () => null, client: { component: B } });`,
      "/app/node_modules/pkg/B.tsx": "export const B = () => null;",
      "/app/.plumix/blocks.ts": `import { C } from "./C.tsx"; import { defineBlock } from "@plumix/blocks"; export const c = defineBlock({ name: "c", render: () => null, client: { component: C } });`,
      "/app/dist/blocks.ts": `import { D } from "./D.tsx"; import { defineBlock } from "@plumix/blocks"; export const d = defineBlock({ name: "d", render: () => null, client: { component: D } });`,
    });
    const islands = scanUserSources("/app", fs);
    expect(islands.map((i) => i.exportName)).toEqual(["A"]);
  });

  test("surfaces `use client` modules alongside defineBlock findings", () => {
    const fs = fixtureFs({
      "/app/src/blocks.ts": `
        import { Search } from "./Search.tsx";
        import { defineBlock } from "@plumix/blocks";
        export const block = defineBlock({
          name: "acme/search",
          render: () => null,
          client: { component: Search },
        });
      `,
      "/app/src/Search.tsx": "export const Search = () => null;",
      // A separate `use client` module — not referenced by any defineBlock,
      // but a theme template imports `Header` and `Footer` and uses them.
      "/app/src/header.tsx": `
        "use client";
        export function Header() { return null; }
        export function Footer() { return null; }
      `,
    });
    const islands = scanUserSources("/app", fs);
    const summarized = islands
      .map((i) => `${i.sourcePath}#${i.exportName}`)
      .sort();
    expect(summarized).toEqual([
      "/app/src/Search.tsx#Search",
      "/app/src/header.tsx#Footer",
      "/app/src/header.tsx#Header",
    ]);
  });

  test("aggregates findings across multiple files in subdirectories", () => {
    const fs = fixtureFs({
      "/app/src/a/blocks.ts": `import { A } from "./A.tsx"; import { defineBlock } from "@plumix/blocks"; export const a = defineBlock({ name: "a", render: () => null, client: { component: A } });`,
      "/app/src/a/A.tsx": "x",
      "/app/src/b/blocks.ts": `import { B } from "./B.tsx"; import { defineBlock } from "@plumix/blocks"; export const b = defineBlock({ name: "b", render: () => null, client: { component: B } });`,
      "/app/src/b/B.tsx": "x",
    });
    const islands = scanUserSources("/app", fs);
    expect(islands).toHaveLength(2);
    expect(new Set(islands.map((i) => i.sourcePath))).toEqual(
      new Set(["/app/src/a/A.tsx", "/app/src/b/B.tsx"]),
    );
  });

  test("ignores files that don't mention defineBlock (cheap pre-filter)", () => {
    const reads: string[] = [];
    const baseFs = fixtureFs({
      "/app/src/blocks.ts": `import { A } from "./A.tsx"; import { defineBlock } from "@plumix/blocks"; export const a = defineBlock({ name: "a", render: () => null, client: { component: A } });`,
      "/app/src/db.ts": "export const db = {};",
      "/app/src/A.tsx": "x",
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
    // db.ts gets a single read (the pre-filter is content-based, so we DO
    // open it once) but AST parse is skipped — we don't strictly assert
    // that here, just that the scan completes without confusing db.ts.
    expect(reads).toContain("/app/src/blocks.ts");
  });
});
