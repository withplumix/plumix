import { describe, expect, test, vi } from "vitest";

import {
  handleDevErrorSourceRequest,
  resolveSourceExcerpt,
  sliceExcerpt,
} from "./dev-error-source.js";

const source = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join("\n");

describe("sliceExcerpt", () => {
  test("returns a window centred on the target line, with only it highlighted", () => {
    const excerpt = sliceExcerpt(source, 10, 3);

    expect(excerpt.map((l) => l.number)).toEqual([7, 8, 9, 10, 11, 12, 13]);
    expect(excerpt.map((l) => l.content)).toEqual([
      "line 7",
      "line 8",
      "line 9",
      "line 10",
      "line 11",
      "line 12",
      "line 13",
    ]);
    expect(excerpt.filter((l) => l.highlighted).map((l) => l.number)).toEqual([
      10,
    ]);
  });

  test("clamps the window at the start of the file", () => {
    expect(sliceExcerpt(source, 2, 5).map((l) => l.number)).toEqual([
      1, 2, 3, 4, 5, 6, 7,
    ]);
  });

  test("clamps the window at the end of the file", () => {
    expect(sliceExcerpt(source, 19, 5).map((l) => l.number)).toEqual([
      14, 15, 16, 17, 18, 19, 20,
    ]);
  });
});

describe("resolveSourceExcerpt", () => {
  const allow = ["/proj"];

  test("reads an allowed source file and returns its excerpt", async () => {
    const readFile = vi.fn().mockResolvedValue(source);

    const excerpt = await resolveSourceExcerpt(
      { file: "/proj/src/theme.tsx", line: 4, allow },
      { readFile },
    );

    expect(readFile).toHaveBeenCalledWith("/proj/src/theme.tsx");
    expect(excerpt).toEqual({
      file: "/proj/src/theme.tsx",
      line: 4,
      lines: [
        { number: 1, content: "line 1", highlighted: false },
        { number: 2, content: "line 2", highlighted: false },
        { number: 3, content: "line 3", highlighted: false },
        { number: 4, content: "line 4", highlighted: true },
        { number: 5, content: "line 5", highlighted: false },
        { number: 6, content: "line 6", highlighted: false },
        { number: 7, content: "line 7", highlighted: false },
        { number: 8, content: "line 8", highlighted: false },
        { number: 9, content: "line 9", highlighted: false },
      ],
    });
  });

  test("allows a hoisted node_modules file under an allowed root", async () => {
    const readFile = vi.fn().mockResolvedValue(source);

    const excerpt = await resolveSourceExcerpt(
      { file: "/proj/node_modules/.pnpm/react/index.js", line: 1, allow },
      { readFile },
    );

    expect(excerpt?.file).toBe("/proj/node_modules/.pnpm/react/index.js");
  });

  test("refuses a node_modules file outside every allowed root", async () => {
    const readFile = vi.fn();

    // Broadening to any `node_modules` tree would be an arbitrary-read vector;
    // only trees under an allowed root (Vite's `fs.allow`) are readable.
    expect(
      await resolveSourceExcerpt(
        { file: "/other/node_modules/.pnpm/react/index.js", line: 1, allow },
        { readFile },
      ),
    ).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  test("refuses a file outside the root and never reads it", async () => {
    const readFile = vi.fn();

    expect(
      await resolveSourceExcerpt(
        { file: "/etc/passwd", line: 1, allow },
        {
          readFile,
        },
      ),
    ).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  test("refuses a path that escapes the root via traversal", async () => {
    const readFile = vi.fn();

    expect(
      await resolveSourceExcerpt(
        { file: "/proj/../etc/passwd", line: 1, allow },
        { readFile },
      ),
    ).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  test("returns null for missing or malformed query params", async () => {
    const readFile = vi.fn();
    const deps = { readFile };

    expect(
      await resolveSourceExcerpt({ file: null, line: 4, allow }, deps),
    ).toBeNull();
    expect(
      await resolveSourceExcerpt(
        { file: "/proj/a.ts", line: null, allow },
        deps,
      ),
    ).toBeNull();
    expect(
      await resolveSourceExcerpt({ file: "/proj/a.ts", line: 0, allow }, deps),
    ).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  test("returns null when the file cannot be read", async () => {
    const readFile = vi.fn().mockRejectedValue(new Error("ENOENT"));

    expect(
      await resolveSourceExcerpt(
        { file: "/proj/gone.ts", line: 1, allow },
        {
          readFile,
        },
      ),
    ).toBeNull();
  });
});

describe("handleDevErrorSourceRequest", () => {
  const allow = ["/proj"];

  test("parses the query and returns the excerpt as a JSON body", async () => {
    const readFile = vi.fn().mockResolvedValue("a\nb\nc");

    const result = await handleDevErrorSourceRequest(
      "/@plumix-dev-error-source?file=%2Fproj%2Fa.ts&line=2",
      allow,
      { readFile },
    );

    expect(readFile).toHaveBeenCalledWith("/proj/a.ts");
    expect(result.status).toBe(200);
    if (result.body === null) throw new Error("expected a JSON body");
    expect(JSON.parse(result.body)).toMatchObject({
      file: "/proj/a.ts",
      line: 2,
    });
  });

  test("returns a 404 with no body for a request that can't be resolved", async () => {
    const result = await handleDevErrorSourceRequest(
      "/@plumix-dev-error-source?file=%2Fetc%2Fpasswd&line=1",
      allow,
      { readFile: vi.fn() },
    );

    expect(result).toEqual({ status: 404, body: null });
  });
});
