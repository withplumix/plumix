import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as sandcastle from "@ai-hero/sandcastle";
import { noSandbox } from "@ai-hero/sandcastle/sandboxes/no-sandbox";

import type { Thinker } from "./lib/agent.js";
import { PROMPT_DIR } from "./lib/agent.js";
import {
  issueBody,
  marketplaceLocation,
  readReviewResult,
  upstreamSection,
} from "./lib/architecture-review.js";
import { say } from "./lib/log.js";
import { REPO_ROOT } from "./lib/repo.js";
import { HALF_AN_HOUR_IN_SECONDS } from "./lib/sandbox.js";

// One run a week of ranking and checking claims, so effort is spent where a wrong
// report would cost the maintainer a grilling session.
const REVIEWER: Thinker = { model: "claude-opus-5-5", effort: "high" };

const OUTPUT_FILE = join(
  process.env.OUTPUT_DIR ?? tmpdir(),
  "architecture-review.json",
);

const skills = marketplaceLocation(
  execFileSync("claude", ["plugin", "marketplace", "list", "--json"], {
    encoding: "utf8",
  }),
  "mattpocock",
);
const explore = upstreamSection(
  readFileSync(
    join(skills, "skills/engineering/improve-codebase-architecture/SKILL.md"),
    "utf8",
  ),
  "### 1. Explore",
);

// The agent runs on the host and reads issues anyone can file, so it gets no
// permission it was not granted: the allow list lives in the user settings the
// workflow writes.
const run = await sandcastle.run({
  name: "architecture-review",
  cwd: REPO_ROOT,
  agent: sandcastle.claudeCode(REVIEWER.model, {
    effort: REVIEWER.effort,
    permissionMode: "dontAsk",
  }),
  sandbox: noSandbox(),
  promptFile: join(PROMPT_DIR, "architecture-review.md"),
  promptArgs: { EXPLORE: explore },
  idleTimeoutSeconds: HALF_AN_HOUR_IN_SECONDS,
  logging: { type: "stdout" },
});

const result = readReviewResult(run.stdout);
if (!result) {
  say("No <title>/<report> or <skipped> block — nothing to file.");
  process.exit(1);
}

writeFileSync(
  OUTPUT_FILE,
  JSON.stringify(
    result.status === "proposed"
      ? { ...result, body: issueBody(result.report) }
      : result,
    null,
    2,
  ),
);
say(
  result.status === "proposed"
    ? `Proposed: ${result.title}`
    : `Skipped: ${result.reason}`,
);
say(`Written to ${OUTPUT_FILE}`);
