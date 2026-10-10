import { fileURLToPath } from "node:url";

import type { Finding } from "./finding";
import type { Roster } from "./roster-drift";
import { checkCodeSamples } from "./code-samples";
import { readContentTree } from "./content-tree";
import { checkPageShape } from "./page-shape";
import { checkParsable } from "./parsable";
import { checkRosterDrift } from "./roster-drift";
import { ROSTERS } from "./rosters";

export const CONTENT_ROOT = fileURLToPath(
  new URL("../content/docs", import.meta.url),
);

/**
 * One traversal shared by every check, so add checks here rather than giving
 * them their own walk. Root and rosters are parameters so fixtures can prove a
 * check fails.
 */
export function runContentChecks(
  root: string,
  rosters: readonly Roster[] = ROSTERS,
): Finding[] {
  const files = readContentTree(root);

  return [
    ...checkParsable(files),
    ...checkPageShape(files),
    ...checkCodeSamples(files),
    ...checkRosterDrift(files, rosters),
  ];
}
