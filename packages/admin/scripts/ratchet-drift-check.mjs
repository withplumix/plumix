#!/usr/bin/env node
// Walk `STRICT_UNWRAPPED_FILES` and, for each entry, force
// `lingui/no-unlocalized-strings` back to `error` from the CLI so
// the override block's relaxation is bypassed. An entry that no
// longer triggers the rule is drift — wrap-ratchet has moved past
// it but the denylist didn't shrink. The CI gate keeps the gate
// honest as surfaces get wrapped.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { STRICT_UNWRAPPED_FILES } from "./strict-unwrapped-files.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const adminRoot = join(here, "..");

const entries = STRICT_UNWRAPPED_FILES;
if (entries.length === 0) {
  console.log("ratchet-drift-check: denylist is empty — nothing to drift.");
  process.exit(0);
}

const drift = [];
for (const file of entries) {
  const result = spawnSync(
    "pnpm",
    [
      "exec",
      "eslint",
      "--rule",
      JSON.stringify({ "lingui/no-unlocalized-strings": "error" }),
      "--format",
      "json",
      file,
    ],
    {
      cwd: adminRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    console.error(
      `ratchet-drift-check: could not parse eslint output for ${file}`,
    );
    process.stderr.write(result.stderr);
    process.exit(2);
  }
  const hits = (parsed[0]?.messages ?? []).filter(
    (m) => m.ruleId === "lingui/no-unlocalized-strings",
  );
  if (hits.length === 0) drift.push(file);
}

if (drift.length > 0) {
  console.error(
    "ratchet-drift-check: the following files no longer trigger lingui/no-unlocalized-strings",
  );
  console.error(
    "and should be removed from STRICT_UNWRAPPED_FILES in packages/admin/scripts/strict-unwrapped-files.mjs:",
  );
  for (const file of drift) console.error(`  - ${file}`);
  process.exit(1);
}

console.log(
  `ratchet-drift-check: all ${String(entries.length)} denylisted file(s) still have unwrapped strings. No drift.`,
);
