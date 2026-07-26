import type { SourceMapInput } from "@jridgewell/trace-mapping";
import { describe, expect, test, vi } from "vitest";

import type { ResolveStackDeps } from "./dev-error-stack.js";
import {
  handleDevErrorStackRequest,
  parseBrowserStack,
  resolveClientStack,
} from "./dev-error-stack.js";

// A one-segment sourcemap: generated (line 1, col 0) maps to source 0 at its
// origin. `sources` deliberately differs from the served module file so a test
// can prove the mapped location came from the map, not the URL/file fallback.
function mapFor(source: string): SourceMapInput {
  return {
    version: 3,
    sources: [source],
    sourcesContent: [null],
    names: [],
    mappings: "AAAA",
  };
}

const noModules: ResolveStackDeps = { lookup: () => Promise.resolve(null) };

describe("parseBrowserStack", () => {
  test("parses Chrome frames with and without a function name", () => {
    const frames = parseBrowserStack(
      [
        "Error: boom",
        "    at Counter (http://localhost:5173/src/Counter.tsx?t=1:14:20)",
        "    at http://localhost:5173/src/main.tsx:3:7",
      ].join("\n"),
    );

    expect(frames).toEqual([
      {
        functionName: "Counter",
        url: "http://localhost:5173/src/Counter.tsx?t=1",
        line: 14,
        column: 20,
      },
      {
        url: "http://localhost:5173/src/main.tsx",
        line: 3,
        column: 7,
      },
    ]);
  });

  test("parses Firefox frames (`fn@url` and bare `@url`)", () => {
    const frames = parseBrowserStack(
      [
        "Counter@http://localhost:5173/src/Counter.tsx?t=1:14:20",
        "@http://localhost:5173/src/main.tsx:3:7",
      ].join("\n"),
    );

    expect(frames[0]).toEqual({
      functionName: "Counter",
      url: "http://localhost:5173/src/Counter.tsx?t=1",
      line: 14,
      column: 20,
    });
    expect(frames[1]).toEqual({
      url: "http://localhost:5173/src/main.tsx",
      line: 3,
      column: 7,
    });
  });

  test("drops lines without a trailing location", () => {
    expect(parseBrowserStack("Error: boom\n    at <anonymous>")).toEqual([]);
  });

  test("drops eval-wrapper and anonymous frames, keeping real ones", () => {
    const frames = parseBrowserStack(
      [
        "    at eval (eval at <anon> (http://localhost:5173/src/a.tsx?t=1:1:1), <anonymous>:1:1)",
        "    at <anonymous>:1:1",
        "    at fn (http://localhost:5173/src/a.tsx:2:1)",
      ].join("\n"),
    );

    expect(frames).toEqual([
      {
        functionName: "fn",
        url: "http://localhost:5173/src/a.tsx",
        line: 2,
        column: 1,
      },
    ]);
  });
});

describe("resolveClientStack", () => {
  test("maps a frame to its original source via the module's sourcemap", async () => {
    const deps: ResolveStackDeps = {
      lookup: vi.fn((url: string) => {
        // The cache-bust query is stripped so the module-graph lookup hits.
        expect(url).toBe("/src/Counter.tsx");
        return Promise.resolve({
          map: mapFor("/proj/src/Counter.tsx"),
          file: "/proj/dist/Counter.js",
        });
      }),
    };

    const frames = await resolveClientStack(
      "    at Counter (http://localhost:5173/src/Counter.tsx?t=1:1:0)",
      deps,
    );

    // The file comes from the map's `sources`, not the served module file —
    // proof the sourcemap drove resolution.
    expect(frames).toEqual([
      {
        functionName: "Counter",
        file: "/proj/src/Counter.tsx",
        line: 1,
        column: 0,
        isVendor: false,
      },
    ]);
  });

  test("resolves a relative sourcemap source against the module file", async () => {
    // Vite's dev transform maps use module-relative `sources` (e.g. `mod.ts`).
    const deps: ResolveStackDeps = {
      lookup: () =>
        Promise.resolve({
          map: mapFor("Counter.tsx"),
          file: "/proj/src/served.js",
        }),
    };

    const frames = await resolveClientStack(
      "    at Counter (http://localhost:5173/src/served.js:1:0)",
      deps,
    );

    expect(frames[0]?.file).toBe("/proj/src/Counter.tsx");
  });

  test("flags node_modules / prebundled-dep frames as vendor", async () => {
    const deps: ResolveStackDeps = {
      lookup: () =>
        Promise.resolve({
          map: null,
          file: "/proj/node_modules/.vite/deps/react-dom_client.js",
        }),
    };

    const frames = await resolveClientStack(
      "    at hydrateRoot (http://localhost:5173/node_modules/.vite/deps/react-dom_client.js?v=abc:1000:5)",
      deps,
    );

    expect(frames[0]?.file).toBe(
      "/proj/node_modules/.vite/deps/react-dom_client.js",
    );
    expect(frames[0]?.isVendor).toBe(true);
  });

  test("falls back to the URL path when the module isn't in the graph", async () => {
    const frames = await resolveClientStack(
      "    at fn (http://localhost:5173/@fs/proj/src/util.ts:9:2)",
      noModules,
    );

    // `/@fs` prefix stripped; the transformed line is kept (best effort).
    expect(frames[0]).toEqual({
      functionName: "fn",
      file: "/proj/src/util.ts",
      line: 9,
      column: 2,
      isVendor: false,
    });
  });
});

describe("handleDevErrorStackRequest", () => {
  test("returns resolved frames for a valid body", async () => {
    const { status, body } = await handleDevErrorStackRequest(
      JSON.stringify({
        stack: "    at fn (http://localhost:5173/src/a.ts:2:1)",
      }),
      noModules,
    );

    expect(status).toBe(200);
    expect(JSON.parse(body)).toEqual({
      frames: [
        {
          functionName: "fn",
          file: "/src/a.ts",
          line: 2,
          column: 1,
          isVendor: false,
        },
      ],
    });
  });

  test("returns 400 for a malformed body", async () => {
    expect(await handleDevErrorStackRequest("not json", noModules)).toEqual({
      status: 400,
      body: JSON.stringify({ frames: [] }),
    });
    expect(
      await handleDevErrorStackRequest(JSON.stringify({ stack: 5 }), noModules),
    ).toEqual({ status: 400, body: JSON.stringify({ frames: [] }) });
  });
});
