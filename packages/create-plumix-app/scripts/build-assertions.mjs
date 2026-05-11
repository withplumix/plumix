import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Throw if any of the expected paths are missing under `targetDir`.
 * Used by the scaffold smoke E2E to verify `plumix build` actually
 * produced the bundle. "Exists" includes directories — callers can
 * check for either a single output file or a top-level output dir.
 *
 * @param {string} targetDir — absolute scaffold path
 * @param {readonly string[]} expectedRelativePaths
 */
export function assertBuildOutputs(targetDir, expectedRelativePaths) {
  for (const rel of expectedRelativePaths) {
    const abs = join(targetDir, rel);
    if (!existsSync(abs)) {
      throw new Error(
        `Expected scaffold build to produce \`${rel}\` under ${targetDir}, but it does not exist.`,
      );
    }
  }
}
