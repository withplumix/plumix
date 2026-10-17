// `pnpm test:mutation`: mutate the lines this branch changed, a package at a time, and print one
// summary. `--restore` puts back what an interrupted run left mutated.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

import type { PackageLines } from "./mutation/render.ts";
import type { Summary } from "./mutation/summary.ts";
import { restore } from "./mutation/journal.ts";
import { render } from "./mutation/render.ts";

const root = path.resolve(import.meta.dirname, "..");
const { values } = parseArgs({
  options: {
    base: { type: "string", default: "origin/main" },
    restore: { type: "boolean", default: false },
  },
});

const workspacePackages = (): string[] => {
  const listed = spawnSync("pnpm", ["-r", "ls", "--json", "--depth", "-1"], {
    cwd: root,
    encoding: "utf8",
  });
  return (JSON.parse(listed.stdout) as { path: string }[])
    .map((p) => p.path)
    .filter((dir) => dir !== root);
};

if (values.restore) {
  for (const dir of workspacePackages()) restore(dir);
  process.exit(0);
}

const mergeBase = spawnSync("git", ["merge-base", values.base, "HEAD"], {
  cwd: root,
  encoding: "utf8",
});
const base = mergeBase.stdout.trim();
if (mergeBase.status !== 0 || base === "") {
  console.error(`No merge base with ${values.base}; fetch it first.`);
  process.exit(2);
}

/** One package at a time: a run rewrites its package's source, which other packages' tests import. */
const turbo = spawnSync(
  "pnpm",
  [
    "exec",
    "turbo",
    "run",
    "test:mutation",
    `--filter=[${base}]`,
    "--concurrency=1",
    "--output-logs=errors-only",
  ],
  { cwd: root, stdio: "inherit", env: { ...process.env, MUTATION_BASE: base } },
);

const packages: PackageLines[] = [];
for (const dir of workspacePackages()) {
  const file = path.join(dir, ".cache/mutation/summary.json");
  if (!existsSync(file)) continue;
  const summary = JSON.parse(readFileSync(file, "utf8")) as Summary & {
    base: string;
  };
  if (summary.base === base)
    packages.push({ package: path.relative(root, dir), lines: summary.lines });
}
const markdown = render(packages);
mkdirSync(path.join(root, ".cache/mutation"), { recursive: true });
writeFileSync(path.join(root, ".cache/mutation/summary.md"), markdown);
console.log(markdown);
process.exit(turbo.status === 0 ? 0 : 3);
