import { existsSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";

import effectsCeilings from "./ratchets/effects.json" with { type: "json" };
import maxLinesCeilings from "./ratchets/max-lines.json" with { type: "json" };
import { plumixPlugin } from "./rules/index.js";

const REPO_ROOT = path.join(import.meta.dirname, "../..");

/**
 * Holds a per-file count at `limit`, except in the files `ceilings` lists by
 * repo-relative path, each held at its own count so it can shrink but not grow.
 */
export interface Ratchet {
  /** The JSON file holding `ceilings`, relative to this package. */
  readonly list: string;
  readonly ruleId: string;
  readonly limit: number;
  /** The rule's entry with `max` as the most the count may reach. */
  readonly entry: (max: number) => Linter.RuleEntry;
  /** Captures the count from the rule's report. */
  readonly reportedCount: RegExp;
  readonly ceilings: Readonly<Record<string, number>>;
}

export const MAX_LINES: Ratchet = {
  list: "ratchets/max-lines.json",
  ruleId: "max-lines",
  limit: 600,
  entry: (max) => ["error", { max, skipBlankLines: true, skipComments: true }],
  reportedCount: /^File has too many lines \((\d+)\)/,
  ceilings: maxLinesCeilings,
};

export const EFFECTS: Ratchet = {
  list: "ratchets/effects.json",
  ruleId: "plumix/max-effects",
  limit: 0,
  entry: (max) => ["error", { max }],
  reportedCount: /^File has (\d+) effect hook calls/,
  ceilings: effectsCeilings,
};

export const RATCHETS: readonly Ratchet[] = [MAX_LINES, EFFECTS];

/** The ratchet's rule at its limit over `scope`, and at each listed file's ceiling. */
export function ratchetConfig(
  ratchet: Ratchet,
  scope: Pick<Linter.Config, "files" | "ignores">,
): Linter.Config[] {
  const listed = Object.entries(ratchet.ceilings).map(
    ([file, ceiling]): Linter.Config => ({
      basePath: REPO_ROOT,
      files: [file],
      rules: { [ratchet.ruleId]: ratchet.entry(ceiling) },
    }),
  );
  return [
    { ...scope, rules: { [ratchet.ruleId]: ratchet.entry(ratchet.limit) } },
    ...listed,
  ];
}

const counter = new Linter({ cwd: REPO_ROOT });

/** The count the ratchet's rule reports for `source`, as the file at `file`. */
export function count(ratchet: Ratchet, file: string, source: string): number {
  const messages = counter.verify(
    source,
    {
      files: ["**/*.ts", "**/*.tsx"],
      // Each package config loaded in this process registers a candidate
      // tsconfig root, and with two candidates and no root set the parser
      // refuses every file.
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { tsconfigRootDir: REPO_ROOT },
      },
      linterOptions: { noInlineConfig: true },
      plugins: { plumix: plumixPlugin },
      rules: { [ratchet.ruleId]: ratchet.entry(0) },
    },
    path.join(REPO_ROOT, file),
  );
  const unreadable = messages.find((message) => message.fatal === true);
  if (unreadable !== undefined) {
    throw new Error(`Could not parse ${file}: ${unreadable.message}`);
  }
  const report = messages.find((message) => message.ruleId === ratchet.ruleId);
  if (report === undefined) return 0;
  const reported = ratchet.reportedCount.exec(report.message)?.[1];
  if (reported === undefined) {
    throw new Error(`No count in the report on ${file}: ${report.message}`);
  }
  return Number(reported);
}

/**
 * The ceilings with each listed file at its count, never above its ceiling,
 * and without the files gone or back at the limit.
 */
export function tightenedCeilings(ratchet: Ratchet): Record<string, number> {
  return Object.fromEntries(
    Object.entries(ratchet.ceilings).flatMap(([file, ceiling]) => {
      const absolute = path.join(REPO_ROOT, file);
      if (!existsSync(absolute)) return [];
      const counted = count(ratchet, file, readFileSync(absolute, "utf8"));
      return counted > ratchet.limit
        ? [[file, Math.min(counted, ceiling)] as const]
        : [];
    }),
  );
}
