// One package's `test:mutation`: mutate the lines this branch changed in the package it runs in.
// `scripts/test-mutation.ts` runs it through turbo with MUTATION_BASE set to the merge base.
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { strykerBin, strykerConfig } from "@plumix/stryker-config";

import type { MutationReport } from "./mutation/summary.ts";
import { restore, save } from "./mutation/journal.ts";
import { changedRanges, isMutable } from "./mutation/ranges.ts";
import { summarize } from "./mutation/summary.ts";

const packageDir = process.cwd();
const reports = path.join(packageDir, ".cache/mutation");

const git = (...args: string[]): string => {
  const result = spawnSync("git", args, {
    cwd: packageDir,
    encoding: "utf8",
    maxBuffer: 64 << 20,
  });
  if (result.status !== 0)
    throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout;
};

const restored = restore(packageDir);
if (restored > 0)
  console.error(
    `Put back ${String(restored)} file(s) an interrupted run left mutated.`,
  );

const base =
  process.env.MUTATION_BASE ?? git("merge-base", "origin/main", "HEAD").trim();
const targets = git("diff", "--name-only", "--relative", base, "--", "src")
  .split("\n")
  .filter((file) => isMutable(file) && existsSync(path.join(packageDir, file)))
  .flatMap((file) =>
    changedRanges(git("diff", "-U0", "--relative", base, "--", file)).map(
      ({ start, end }) => `${file}:${String(start)}-${String(end)}`,
    ),
  );

mkdirSync(reports, { recursive: true });
const rawPath = path.join(reports, "raw.json");
rmSync(rawPath, { force: true });
if (targets.length === 0) {
  writeFileSync(
    path.join(reports, "summary.json"),
    JSON.stringify({ base, lines: [], broken: [] }),
  );
  process.exit(0);
}

save(packageDir, [
  ...new Set(targets.map((target) => target.replace(/:\d+-\d+$/, ""))),
]);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    restore(packageDir);
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}
const run = spawnSync(
  process.execPath,
  [strykerBin, "run", strykerConfig, "--mutate", targets.join(",")],
  {
    cwd: packageDir,
    encoding: "utf8",
    maxBuffer: 256 << 20,
  },
);
restore(packageDir);
writeFileSync(path.join(reports, "stryker.log"), run.stdout + run.stderr);

if (run.status !== 0) {
  console.error(
    `Stryker failed (exit ${String(run.status)}); .cache/mutation/stryker.log says why.`,
  );
  process.exit(3);
}
/** No report from a clean exit means every changed line was skipped, so nothing was mutated. */
const summary = existsSync(rawPath)
  ? summarize(JSON.parse(readFileSync(rawPath, "utf8")) as MutationReport)
  : { lines: [], broken: [] };
writeFileSync(
  path.join(reports, "summary.json"),
  JSON.stringify({ base, ...summary }),
);
if (summary.broken.length > 0) {
  console.error(
    `The runner ran no test for ${summary.broken.join(", ")}: these results say nothing.`,
  );
  process.exit(3);
}
