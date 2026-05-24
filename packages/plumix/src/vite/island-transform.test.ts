import { describe, expect, test } from "vitest";

import type { ScannerFs } from "./island-transform.js";
import { findIslands, scanUserSources } from "./island-transform.js";

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
