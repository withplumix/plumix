import { fileURLToPath } from "node:url";

import type { Finding } from "./finding";
import { readContentTree } from "./content-tree";
import { checkPageShape } from "./page-shape";

/** The content root the published site is built from. */
export const CONTENT_ROOT = fileURLToPath(
  new URL("../content/docs", import.meta.url),
);

/**
 * Run every content check over one traversal of a content root. Checks are
 * added here rather than given a traversal of their own, so the suite stays
 * fast as the tree grows past a hundred pages.
 */
export function runContentChecks(root: string): Finding[] {
  return checkPageShape(readContentTree(root));
}
