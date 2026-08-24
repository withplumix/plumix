import { stripVTControlCharacters } from "node:util";
import { afterEach, describe, expect, test, vi } from "vitest";

import { CliError } from "@plumix/core";

import { badge, exitWithError } from "./report.js";

describe("badge", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("writes the plumix label and version to stderr", () => {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);

    badge("1.2.3");

    const out = spy.mock.calls.map((c) => String(c[0])).join("");
    expect(out).toContain("plumix");
    expect(out).toContain("v1.2.3");
  });
});

describe("exitWithError", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function capture(error: unknown): string {
    const spy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    vi.spyOn(process, "exit").mockImplementation(() => undefined as never);
    exitWithError(error);
    // CI sets FORCE_COLOR, and `report` resolves that once at module load —
    // so strip the styling rather than assert against it.
    return stripVTControlCharacters(
      spy.mock.calls.map((c) => String(c[0])).join(""),
    );
  }

  test("prints the cause, not just the code and generic hint", () => {
    // The #1883 failure: a config importing a workspace dist CI hadn't built.
    const out = capture(
      CliError.configLoadFailed({
        configPath: "playground/plumix.config.ts",
        cause: new Error(
          "Cannot find package '@plumix/plugin-blog' imported from playground/plumix.config.ts",
        ),
      }),
    );

    expect(out).toContain("config_load_failed");
    expect(out).toContain("Cannot find package '@plumix/plugin-blog'");
    expect(out).toContain("Check the file for syntax errors");
  });

  test("indents every line of a multi-line cause under the error", () => {
    // Node's bare-specifier failure carries a require stack, so the cause is
    // three lines; flush-left they would read as belonging to the hint below.
    const out = capture(
      CliError.configLoadFailed({
        configPath: "playground/plumix.config.ts",
        cause: new Error(
          "Cannot find module '@plumix/plugin-blog'\nRequire stack:\n- playground/plumix.config.ts",
        ),
      }),
    );

    const lines = out.trimEnd().split("\n");
    expect(lines.slice(1)).toEqual([
      "  Cannot find module '@plumix/plugin-blog'",
      "  Require stack:",
      "  - playground/plumix.config.ts",
      "  → Check the file for syntax errors and ensure every import resolves.",
    ]);
  });

  test("prints a cause that is not an Error rather than dropping it", () => {
    // A config that throws a primitive — the text is all the reader gets.
    const out = capture(
      CliError.configLoadFailed({
        configPath: "plumix.config.ts",
        cause: "boom, no Error wrapper",
      }),
    );

    expect(out).toContain("boom, no Error wrapper");
  });

  test("prints only the code, message and hint when there is no cause", () => {
    const out = capture(
      CliError.configInvalid({ configPath: "plumix.config.ts" }),
    );

    expect(out).toContain("config_invalid: Invalid config shape");
    expect(out).toContain("Default export must be");
    expect(out.trimEnd().split("\n")).toHaveLength(2);
  });
});
