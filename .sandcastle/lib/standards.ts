import { readFileSync } from "node:fs";
import { join } from "node:path";

import { REPO_ROOT } from "./repo.js";

const HEADING = "## Review checklist";

/** The checklist section of CODING_STANDARDS.md, without its heading. */
export function reviewChecklistIn(standards: string): string {
  const start = standards.indexOf(`\n${HEADING}\n`);
  if (start === -1)
    throw new Error(`CODING_STANDARDS.md has no "${HEADING}" section`);
  const body = standards.slice(start + HEADING.length + 2);
  const end = body.search(/^## /m);
  return (end === -1 ? body : body.slice(0, end)).trim();
}

/**
 * Read from the checkout the run ships from, not the ticket's branch, so a
 * checklist change reaches the next run before it reaches main.
 */
export function reviewChecklist(): string {
  return reviewChecklistIn(
    readFileSync(join(REPO_ROOT, "CODING_STANDARDS.md"), "utf8"),
  );
}
