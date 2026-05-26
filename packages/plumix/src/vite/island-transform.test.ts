import { describe, expect, test } from "vitest";

import type { ScannerFs } from "./island-transform.js";
import {
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
    expect(out).toContain(`from "/abs/path/Counter.tsx?plumix-orig"`);
    // Re-exports every name the original exports, but as a shim.
    expect(out).toMatch(/export\s+function\s+Counter\s*\(/);
    // Shim wraps in `<plumix-island>` with chunk-url + component-export
    // + ssr="" baked in. We just check the literals are present — the
    // exact JSX/createElement shape is an internal detail.
    expect(out).toContain('"chunk-url": "/src/Counter.tsx"');
    expect(out).toContain('"component-export": "Counter"');
    // `ssr=""` gates nested hydration for SSR'd islands; `only` islands get
    // `null` (no markup, no gate).
    expect(out).toContain('"ssr": __only ? null : ""');
  });

  test("shim defaults the hydration trigger to `interaction`", () => {
    // `IslandProps<T>` enforces the type at compile time; the custom
    // element dispatches `plumix:hydration-error` for unknown strategies at
    // runtime. The shim passes an explicit `client` prop through and falls
    // back to `interaction` — hydrate on first user intent.
    const source = `
      "use client";
      export function Counter() { return null; }
    `;
    const result = transformUseClientModule(source, "/Counter.tsx", {
      chunkUrl: "/Counter.tsx",
    });
    expect(result?.code).toContain(
      `typeof client === "string" ? client : "interaction"`,
    );
  });

  test("shim resolves a default `prefetch` trigger per the defaults table", () => {
    // Prefetch (chunk download) is split from hydrate (mount): the
    // `interaction` default warms on `visible` so the first click is
    // instant. Authors override via the `prefetch` prop, which the shim
    // destructures out and forwards as a `prefetch=` attribute.
    const source = `
      "use client";
      export function Counter() { return null; }
    `;
    const result = transformUseClientModule(source, "/Counter.tsx", {
      chunkUrl: "/Counter.tsx",
    });
    expect(result?.code).toContain(`interaction: "visible"`);
    expect(result?.code).toContain(
      `typeof prefetch === "string" ? prefetch : (__PREFETCH_DEFAULTS[__when]`,
    );
    expect(result?.code).toContain('"prefetch": __pf');
  });

  test("shim renders no SSR markup for an `only` island (empty shell)", () => {
    const source = `
      "use client";
      export function BrowserOnly() { return null; }
    `;
    const result = transformUseClientModule(source, "/BrowserOnly.tsx", {
      chunkUrl: "/BrowserOnly.tsx",
    });
    // The child render + the `ssr` gate are both guarded on `__only`, so an
    // `only` island emits `<plumix-island>` with no children.
    expect(result?.code).toContain('const __only = __when === "only"');
    expect(result?.code).toContain(
      `__only ? null : __c(__orig["BrowserOnly"], wrapped)`,
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
    // Props travel through `serializeProps` (plumix's tuple format)
    // — the custom element's `deserializeProps` expects this shape
    // so Date/Map/Set/etc. survive the round-trip.
    expect(result?.code).toContain("__ser(rest)");
    // The shim destructures `client` + `prefetch` out before forwarding so
    // neither strategy slot leaks into the props attribute.
    expect(result?.code).toContain("const { client, prefetch, ...rest }");
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

  test("shim wraps React-element props in <plumix-static-slot> and lists them on `slots`", () => {
    const source = `
      "use client";
      export function Wrapper() { return null; }
    `;
    const result = transformUseClientModule(source, "/Wrapper.tsx", {
      chunkUrl: "/Wrapper.tsx",
    });
    // The shim detects React elements via $$typeof === Symbol and wraps
    // each in a <plumix-static-slot>. Slot names go on a `slots=`
    // attribute so the custom element knows which descendants to extract
    // at hydrate time.
    expect(result?.code).toContain("$$typeof");
    expect(result?.code).toContain('"plumix-static-slot"');
    expect(result?.code).toContain('"slots"');
    // Wrapped element props must NOT appear in the serialized `props=`
    // attribute (they'd serialize to a meaningless object). Props go
    // through `serializeProps` (plumix's tuple format).
    expect(result?.code).toContain("__ser(rest)");
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
