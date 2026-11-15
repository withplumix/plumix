import * as path from "node:path";
import type { Linter } from "eslint";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { describe, expect, it } from "vitest";

import type { Ratchet } from "../ratchet.js";
import { baseConfig } from "../base.js";
import {
  count,
  MAX_LINES,
  ratchetConfig,
  RATCHETS,
  tightenedCeilings,
} from "../ratchet.js";

const fixturesDir = path.join(import.meta.dirname, "fixtures");
const REPO_ROOT = path.join(import.meta.dirname, "../../..");

const PARSED: Linter.Config = {
  files: ["**/*.ts", "**/*.tsx"],
  languageOptions: { parser: tseslint.parser },
};

const SCOPE = { files: ["src/**/*.ts"], ignores: ["**/*.test.ts"] };

function codeLines(lines: number): string {
  return Array.from(
    { length: lines },
    (_, index) => `export const line${index} = ${index};\n`,
  ).join("");
}

async function ratchetReports(
  ratchet: Ratchet,
  filePath: string,
  source: string,
): Promise<string[]> {
  const eslint = new ESLint({
    cwd: fixturesDir,
    overrideConfigFile: true,
    overrideConfig: [PARSED, ...ratchetConfig(ratchet, SCOPE)],
  });
  const [result] = await eslint.lintText(source, { filePath });
  return (result?.messages ?? []).map((message) => message.message);
}

describe("ratchetConfig over max-lines", () => {
  it("fails a file over the limit and passes one at it", async () => {
    await expect(
      ratchetReports(MAX_LINES, "src/unlisted.ts", codeLines(601)),
    ).resolves.toEqual([
      "File has too many lines (601). Maximum allowed is 600.",
    ]);
    await expect(
      ratchetReports(MAX_LINES, "src/unlisted.ts", codeLines(600)),
    ).resolves.toEqual([]);
  });

  it("counts neither blank lines nor comment lines", async () => {
    const padded = `// a comment line\n\n/**\n * A block.\n */\n${codeLines(600)}\n`;

    await expect(
      ratchetReports(MAX_LINES, "src/unlisted.ts", padded),
    ).resolves.toEqual([]);
  });

  it("holds a listed file at its ceiling, from any linting package", async () => {
    const listed: Ratchet = {
      ...MAX_LINES,
      ceilings: { "tooling/eslint/test/fixtures/src/listed.ts": 700 },
    };

    await expect(
      ratchetReports(listed, "src/listed.ts", codeLines(700)),
    ).resolves.toEqual([]);
    await expect(
      ratchetReports(listed, "src/listed.ts", codeLines(701)),
    ).resolves.toEqual([
      "File has too many lines (701). Maximum allowed is 700.",
    ]);
  });

  it("leaves files outside the scope alone", async () => {
    await expect(
      ratchetReports(MAX_LINES, "src/unlisted.test.ts", codeLines(601)),
    ).resolves.toEqual([]);
  });
});

describe("count", () => {
  it("counts code lines, the way the rule does", () => {
    const source = `// a comment line\n\n${codeLines(5)}/** A block. */\n`;

    expect(count(MAX_LINES, "src/counted.ts", source)).toBe(5);
  });

  it("counts past directives, even one disabling the ratchet's rule", () => {
    const source = `/* eslint-disable max-lines -- a reason */\n// eslint-disable-next-line react-hooks/exhaustive-deps -- a reason\n${codeLines(3)}`;

    expect(count(MAX_LINES, "src/counted.ts", source)).toBe(3);
  });

  it("parses JSX in a .tsx file", () => {
    const source = "export const Box = () => <div />;\n";

    expect(count(MAX_LINES, "src/counted.tsx", source)).toBe(1);
  });
});

describe("tightenedCeilings", () => {
  const FIVE_LINES = "tooling/eslint/test/fixtures/src/ratchet-five-lines.ts";
  const listing = (limit: number, ceiling: number): Ratchet => ({
    ...MAX_LINES,
    limit,
    ceilings: { [FIVE_LINES]: ceiling },
  });

  it("keeps a file listed at its count", () => {
    expect(tightenedCeilings(listing(2, 5))).toEqual({ [FIVE_LINES]: 5 });
  });

  it("lowers the ceiling of a file that shrank", () => {
    expect(tightenedCeilings(listing(2, 9))).toEqual({ [FIVE_LINES]: 5 });
  });

  it("never raises the ceiling of a file that grew", () => {
    expect(tightenedCeilings(listing(2, 4))).toEqual({ [FIVE_LINES]: 4 });
  });

  it("drops a file that shrank to the limit", () => {
    expect(tightenedCeilings(listing(5, 9))).toEqual({});
  });

  it("drops a file that no longer exists", () => {
    const gone: Ratchet = { ...MAX_LINES, ceilings: { "src/gone.ts": 900 } };

    expect(tightenedCeilings(gone)).toEqual({});
  });
});

describe("max-lines in baseConfig", () => {
  const eslint = new ESLint({
    cwd: fixturesDir,
    overrideConfigFile: true,
    overrideConfig: baseConfig,
  });

  async function maxLinesEntry(file: string): Promise<unknown> {
    const config = (await eslint.calculateConfigForFile(file)) as
      Linter.Config | undefined;
    return config?.rules?.["max-lines"];
  }

  it("holds production source at the limit", async () => {
    await expect(maxLinesEntry("src/restricted-syntax.ts")).resolves.toEqual([
      2,
      { max: 600, skipBlankLines: true, skipComments: true },
    ]);
  });

  it("holds each listed file at its ceiling, linted from its package", async () => {
    const entries = Object.entries(MAX_LINES.ceilings).map(async ([file]) => {
      const fromPackage = new ESLint({
        cwd: path.join(REPO_ROOT, file.slice(0, file.indexOf("/src/"))),
        overrideConfigFile: true,
        overrideConfig: baseConfig,
      });
      const config = (await fromPackage.calculateConfigForFile(
        path.join(REPO_ROOT, file),
      )) as Linter.Config | undefined;
      return [file, config?.rules?.["max-lines"]];
    });

    await expect(Promise.all(entries)).resolves.toEqual(
      Object.entries(MAX_LINES.ceilings).map(([file, ceiling]) => [
        file,
        [2, { max: ceiling, skipBlankLines: true, skipComments: true }],
      ]),
    );
  });

  it("exempts tests and files outside src", async () => {
    await expect(maxLinesEntry("src/carve-out.test.ts")).resolves.toBe(
      undefined,
    );
    await expect(maxLinesEntry("scripts/carve-out.ts")).resolves.toBe(
      undefined,
    );
  });
});

describe("the committed ceilings", () => {
  it.each(RATCHETS)("list $ruleId at each file's count", (ratchet) => {
    expect(
      tightenedCeilings(ratchet),
      `${ratchet.list} is out of date: run \`pnpm --filter @plumix/eslint-config ratchet:update\` and commit it`,
    ).toEqual(ratchet.ceilings);
  });
});
