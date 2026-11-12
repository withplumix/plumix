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
  const isServable = (path: string) => path.startsWith("/proj/");

  test("reads a servable source file and returns its excerpt", async () => {
    const readFile = vi.fn().mockResolvedValue(source);

    const excerpt = await resolveSourceExcerpt(
      { file: "/proj/src/theme.tsx", line: 4 },
      { readFile, isServable },
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

  test("denies a file the dev server would not serve, and never reads it", async () => {
    const readFile = vi.fn();

    expect(
      await resolveSourceExcerpt(
        { file: "/etc/passwd", line: 1 },
        { readFile, isServable },
      ),
    ).toBe("denied");
    expect(readFile).not.toHaveBeenCalled();
  });

  test("asks about the path with any traversal resolved", async () => {
    const asked = vi.fn(isServable);

    await resolveSourceExcerpt(
      { file: "/proj/../etc/passwd", line: 1 },
      { readFile: vi.fn(), isServable: asked },
    );

    expect(asked).toHaveBeenCalledWith("/etc/passwd");
  });

  test("returns null for missing or malformed query params", async () => {
    const readFile = vi.fn();
    const deps = { readFile, isServable };

    expect(
      await resolveSourceExcerpt({ file: null, line: 4 }, deps),
    ).toBeNull();
    expect(
      await resolveSourceExcerpt({ file: "/proj/a.ts", line: null }, deps),
    ).toBeNull();
    expect(
      await resolveSourceExcerpt({ file: "/proj/a.ts", line: 0 }, deps),
    ).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  test("returns null when the file cannot be read", async () => {
    const readFile = vi.fn().mockRejectedValue(new Error("ENOENT"));

    expect(
      await resolveSourceExcerpt(
        { file: "/proj/gone.ts", line: 1 },
        { readFile, isServable },
      ),
    ).toBeNull();
  });
});

describe("handleDevErrorSourceRequest", () => {
  const isServable = (path: string) => path.startsWith("/proj/");

  test("parses the query and returns the excerpt as a JSON body", async () => {
    const readFile = vi.fn().mockResolvedValue("a\nb\nc");

    const result = await handleDevErrorSourceRequest(
      "/@plumix-dev-error-source?file=%2Fproj%2Fa.ts&line=2",
      { readFile, isServable },
    );

    expect(readFile).toHaveBeenCalledWith("/proj/a.ts");
    expect(result.status).toBe(200);
    if (result.body === null) throw new Error("expected a JSON body");
    expect(JSON.parse(result.body)).toMatchObject({
      file: "/proj/a.ts",
      line: 2,
    });
  });

  test("returns a 403 with no body for a file the dev server would not serve", async () => {
    const result = await handleDevErrorSourceRequest(
      "/@plumix-dev-error-source?file=%2Fetc%2Fpasswd&line=1",
      { readFile: vi.fn(), isServable },
    );

    expect(result).toEqual({ status: 403, body: null });
  });

  test("returns a 404 with no body for a file that can't be read", async () => {
    const result = await handleDevErrorSourceRequest(
      "/@plumix-dev-error-source?file=%2Fproj%2Fgone.ts&line=1",
      { readFile: vi.fn().mockRejectedValue(new Error("ENOENT")), isServable },
    );

    expect(result).toEqual({ status: 404, body: null });
  });
});
