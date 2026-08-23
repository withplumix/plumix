import { fileURLToPath } from "node:url";

import type { Finding } from "./finding";
import type { Roster } from "./roster-drift";
import { checkCodeSamples } from "./code-samples";
import { readContentTree } from "./content-tree";
import { checkPageShape } from "./page-shape";
import { checkRosterDrift } from "./roster-drift";
import { ROSTERS } from "./rosters";

/** The content root the published site is built from. */
export const CONTENT_ROOT = fileURLToPath(
  new URL("../content/docs", import.meta.url),
);

/**
 * Run every content check over one traversal of a content root. Checks are
 * added here rather than given a traversal of their own, so the suite stays
 * fast as the tree grows past a hundred pages.
 *
 * The rosters are a parameter for the same reason the root is: a check has to
 * be provable against content built to break it.
 */
export function runContentChecks(
  root: string,
  rosters: readonly Roster[] = ROSTERS,
): Finding[] {
  const pages = readContentTree(root);

  return [
    ...checkPageShape(pages),
    ...checkCodeSamples(pages),
    ...checkRosterDrift(pages, rosters),
  ];
}
