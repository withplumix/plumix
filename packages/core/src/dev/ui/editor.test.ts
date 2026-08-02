import { describe, expect, test } from "vitest";

import {
  buildEditorUrl,
  resolveEditorPathMap,
  resolveEditorTemplate,
} from "./editor.js";

describe("resolveEditorTemplate", () => {
  test("defaults to VS Code when the setting is unset", () => {
    expect(resolveEditorTemplate(undefined)).toBe(
      "vscode://file/{file}:{line}:{column}",
    );
  });

  test("maps a known-editor key to its built-in template", () => {
    expect(resolveEditorTemplate("cursor")).toBe(
      "cursor://file/{file}:{line}:{column}",
    );
    expect(resolveEditorTemplate("zed")).toBe(
      "zed://file/{file}:{line}:{column}",
    );
  });

  test("returns a custom format string verbatim when it carries a {file} placeholder", () => {
    const custom = "myeditor://open?path={file}&line={line}&col={column}";
    expect(resolveEditorTemplate(custom)).toBe(custom);
  });

  test("falls back to the default for an unrecognized key with no placeholder", () => {
    expect(resolveEditorTemplate("notaneditor")).toBe(
      "vscode://file/{file}:{line}:{column}",
    );
  });

  test("opts out of the link entirely for `off` / `none`", () => {
    expect(resolveEditorTemplate("off")).toBeUndefined();
    expect(resolveEditorTemplate("none")).toBeUndefined();
  });
});

describe("buildEditorUrl", () => {
  test("substitutes file, line, and column into the template", () => {
    const url = buildEditorUrl("vscode://file/{file}:{line}:{column}", {
      file: "/proj/src/theme.tsx",
      line: 12,
      column: 7,
    });
    expect(url).toBe("vscode://file//proj/src/theme.tsx:12:7");
  });

  test("defaults the column to 1 when the frame carried none", () => {
    const url = buildEditorUrl("vscode://file/{file}:{line}:{column}", {
      file: "/proj/src/theme.tsx",
      line: 12,
    });
    expect(url).toBe("vscode://file//proj/src/theme.tsx:12:1");
  });

  test("URL-encodes spaces in the path but keeps slashes and a drive colon intact", () => {
    const url = buildEditorUrl("vscode://file/{file}:{line}:{column}", {
      file: "C:/My Project/src/a.ts",
      line: 3,
      column: 1,
    });
    expect(url).toBe("vscode://file/C:/My%20Project/src/a.ts:3:1");
  });

  test("fills every placeholder occurrence, not just the first", () => {
    const url = buildEditorUrl("x://{file}?also={file}", {
      file: "/a.ts",
      line: 1,
      column: 1,
    });
    expect(url).toBe("x:///a.ts?also=/a.ts");
  });

  test("remaps the file path prefix before filling the template", () => {
    const url = buildEditorUrl(
      "vscode://file/{file}:{line}:{column}",
      { file: "/workspace/src/theme.tsx", line: 12, column: 7 },
      { from: "/workspace", to: "/Users/me/proj" },
    );
    expect(url).toBe("vscode://file//Users/me/proj/src/theme.tsx:12:7");
  });

  test("leaves a path that does not start with the mapped prefix untouched", () => {
    const url = buildEditorUrl(
      "vscode://file/{file}:{line}:{column}",
      { file: "/other/src/a.ts", line: 3, column: 1 },
      { from: "/workspace", to: "/Users/me/proj" },
    );
    expect(url).toBe("vscode://file//other/src/a.ts:3:1");
  });

  test("remaps a path that equals the mapped prefix exactly", () => {
    const url = buildEditorUrl(
      "vscode://file/{file}:{line}:{column}",
      { file: "/workspace", line: 1, column: 1 },
      { from: "/workspace", to: "/Users/me/proj" },
    );
    expect(url).toBe("vscode://file//Users/me/proj:1:1");
  });

  test("only matches the prefix at a path boundary, not a partial segment", () => {
    const url = buildEditorUrl(
      "vscode://file/{file}:{line}:{column}",
      { file: "/workspace-other/a.ts", line: 1, column: 1 },
      { from: "/workspace", to: "/Users/me/proj" },
    );
    expect(url).toBe("vscode://file//workspace-other/a.ts:1:1");
  });

  test("URL-encodes the remapped path", () => {
    const url = buildEditorUrl(
      "vscode://file/{file}:{line}:{column}",
      { file: "/workspace/a.ts", line: 1, column: 1 },
      { from: "/workspace", to: "/Users/My Name/proj" },
    );
    expect(url).toBe("vscode://file//Users/My%20Name/proj/a.ts:1:1");
  });
});

describe("resolveEditorPathMap", () => {
  test("parses a `from=>to` mapping", () => {
    expect(resolveEditorPathMap("/workspace=>/Users/me/proj")).toEqual({
      from: "/workspace",
      to: "/Users/me/proj",
    });
  });

  test("returns undefined when unset or empty", () => {
    expect(resolveEditorPathMap(undefined)).toBeUndefined();
    expect(resolveEditorPathMap("")).toBeUndefined();
  });

  test("returns undefined when the `=>` separator is missing", () => {
    expect(resolveEditorPathMap("/workspace")).toBeUndefined();
  });

  test("returns undefined when either side is empty", () => {
    expect(resolveEditorPathMap("=>/Users/me/proj")).toBeUndefined();
    expect(resolveEditorPathMap("/workspace=>")).toBeUndefined();
  });

  test("strips a trailing slash from both sides so `/ws/` and `/ws` behave alike", () => {
    expect(resolveEditorPathMap("/workspace/=>/Users/me/proj/")).toEqual({
      from: "/workspace",
      to: "/Users/me/proj",
    });
  });

  test("round-trips through buildEditorUrl", () => {
    const map = resolveEditorPathMap("/workspace=>/Users/me/proj");
    const url = buildEditorUrl(
      "vscode://file/{file}:{line}:{column}",
      { file: "/workspace/src/a.ts", line: 5 },
      map,
    );
    expect(url).toBe("vscode://file//Users/me/proj/src/a.ts:5:1");
  });
});
