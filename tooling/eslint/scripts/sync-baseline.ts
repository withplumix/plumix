import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";

import type { BaselineEntry } from "../rules/sync-comment-guarded.js";
import type { SourceFile } from "./baseline.js";
import { repoRootOf } from "../rules/sync-comment-guarded.js";
import { isLintedFile, occurrencesIn, syncBaseline } from "./baseline.js";

const BASELINE = path.join(
  import.meta.dirname,
  "../sync-comment-baseline.json",
);
const root = repoRootOf(BASELINE);

/** The rule suite's violating inputs, which `eslint.config.ts` ignores. */
const RULE_FIXTURES = "tooling/eslint/test/fixtures/";

const linted = new Map<string, boolean>();

/**
 * The nearest package above a file that declares `lint` lints it, even past a
 * nested package (a playground) that declares none. The root's runs turbo.
 */
function packageLints(dir: string): boolean {
  if (dir === ".") return false;
  const cached = linted.get(dir);
  if (cached !== undefined) return cached;
  const manifest = path.join(root, dir, "package.json");
  const { scripts } = existsSync(manifest)
    ? (JSON.parse(readFileSync(manifest, "utf8")) as {
        scripts?: Record<string, string>;
      })
    : {};
  const lints =
    scripts?.lint !== undefined || packageLints(path.posix.dirname(dir));
  linted.set(dir, lints);
  return lints;
}

function lintedFiles(): SourceFile[] {
  const tracked = execFileSync(
    "git",
    ["ls-files", "-z", "--", "*.ts", "*.tsx"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  return tracked
    .split("\0")
    .filter((file) => file !== "")
    .filter(isLintedFile)
    .filter((file) => !file.startsWith(RULE_FIXTURES))
    .filter((file) => packageLints(path.posix.dirname(file)))
    .map((file) => ({
      file,
      text: readFileSync(path.join(root, file), "utf8"),
    }));
}

const mode = process.argv.includes("--check") ? "check" : "write";
const previous = JSON.parse(readFileSync(BASELINE, "utf8")) as BaselineEntry[];
const { baseline, problems } = syncBaseline(
  previous,
  occurrencesIn(root, lintedFiles()),
  mode,
);
for (const problem of problems) console.error(problem);
if (problems.length > 0) process.exit(1);
if (baseline !== null) {
  writeFileSync(BASELINE, `${JSON.stringify(baseline, null, 2)}\n`);
}
