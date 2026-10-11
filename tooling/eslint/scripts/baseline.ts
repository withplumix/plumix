import * as path from "node:path";
import { Linter } from "eslint";
import tseslint from "typescript-eslint";

import type { BaselineEntry } from "../rules/sync-comment-guarded.js";
import { lineHash, syncCommentGuarded } from "../rules/sync-comment-guarded.js";

/** An unguarded coupling comment as it stands in the tree today. */
export interface Occurrence extends BaselineEntry {
  readonly line: number;
}

export interface SourceFile {
  /** Repo-relative, with `/` separators. */
  readonly file: string;
  readonly text: string;
}

/**
 * Runs the rule itself, with no baseline and no type information, so what the
 * script records is exactly what lint would report.
 */
export function occurrencesIn(
  root: string,
  files: readonly SourceFile[],
): Occurrence[] {
  const linter = new Linter({ cwd: root });
  const config: Linter.Config = {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: { parser: tseslint.parser },
    plugins: {
      plumix: { rules: { "sync-comment-guarded": syncCommentGuarded } },
    },
    rules: { "plumix/sync-comment-guarded": "error" },
  };
  return files.flatMap(({ file, text }) => {
    const lines = text.split(/\r?\n/);
    const messages = linter.verify(text, config, path.join(root, file));
    const fatal = messages.find((message) => message.fatal);
    if (fatal) throw new Error(`${file}:${fatal.line} ${fatal.message}`);
    return messages
      .filter((message) => message.messageId === "unguarded")
      .map((message) => ({
        file,
        hash: lineHash(lines[message.line - 1] ?? ""),
        line: message.line,
      }));
  });
}

const keyOf = (entry: BaselineEntry): string => `${entry.file}\0${entry.hash}`;

/**
 * Counts rather than a set, because a file can repeat a line verbatim and a
 * second copy is as new as any other.
 */
function without<T extends BaselineEntry>(
  entries: readonly T[],
  removed: readonly BaselineEntry[],
): T[] {
  const remaining = new Map<string, number>();
  for (const entry of removed) {
    remaining.set(keyOf(entry), (remaining.get(keyOf(entry)) ?? 0) + 1);
  }
  return entries.filter((entry) => {
    const count = remaining.get(keyOf(entry)) ?? 0;
    remaining.set(keyOf(entry), count - 1);
    return count <= 0;
  });
}

export function syncBaseline(
  previous: readonly BaselineEntry[],
  current: readonly Occurrence[],
  mode: "write" | "check",
): { baseline: BaselineEntry[] | null; problems: string[] } {
  const grown = without(current, previous).map(
    ({ file, line }) =>
      `${file}:${line} adds a coupling comment that names no guarding test.`,
  );
  if (mode === "write") {
    if (grown.length > 0) return { baseline: null, problems: grown };
    const baseline = current
      .map(({ file, hash }) => ({ file, hash }))
      .sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1));
    return { baseline, problems: [] };
  }
  const stale = without(previous, current).map(
    ({ file, hash }) =>
      `${file} has no coupling comment hashed ${hash}. Run \`pnpm --filter @plumix/eslint-config sync-baseline\` to drop the entry.`,
  );
  return { baseline: null, problems: [...stale, ...grown] };
}
