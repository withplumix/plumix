// Block a release that would cross into >= 1.0.0 while we're deliberately in
// 0.x. Changesets does no 0.x demotion — a `major` changeset on a 0.x package
// resolves straight to 1.0.0 — so a reflexive `major` bump would ship 1.0 as a
// side effect of merging a feature PR. Crossing 1.0 is a decision; when we mean
// it, delete this guard.
//
// Reads the changeset files directly rather than via `changeset status`: that
// command diffs against the base branch (needs full git history, absent on a
// shallow CI checkout) and separately fails when versionable packages changed
// without a changeset — neither behaviour belongs in this guard.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const dir = ".changeset";
const offenders = [];

for (const file of readdirSync(dir)) {
  if (file === "README.md" || !file.endsWith(".md")) continue;
  const frontmatter = readFileSync(join(dir, file), "utf8").match(
    /^---\n([\s\S]*?)\n---/,
  );
  if (!frontmatter) continue;
  for (const line of frontmatter[1].split("\n")) {
    const bump = line.match(/^\s*(.+?)\s*:\s*["']?major["']?\s*$/);
    if (bump) offenders.push({ file, pkg: bump[1].replace(/["']/g, "") });
  }
}

if (offenders.length > 0) {
  console.error("Refusing to release >= 1.0.0 while the project is in 0.x:\n");
  for (const { file, pkg } of offenders) {
    console.error(`  ${file}: ${pkg} -> major (resolves to 1.0.0)`);
  }
  console.error(
    "\nA `major` changeset takes a 0.x package straight to 1.0.0. If crossing\n" +
      "1.0 is intentional, remove this guard (.github/scripts/check-no-major.mjs)\n" +
      "in the same PR.",
  );
  process.exit(1);
}

console.log("No `major` changesets pending.");
