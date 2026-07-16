import { applyEdits, modify } from "jsonc-parser";

import { fillProjectName } from "./types.js";

const FORMATTING = { insertSpaces: true, tabSize: 2 } as const;

/**
 * Merge top-level binding patches (e.g. a plugin's `r2_buckets`) into the
 * runtime's `wrangler.jsonc`, editing the text through jsonc-parser so the
 * runtime's inline comments survive. Project-name tokens in both the base
 * and the patches are substituted last.
 */
export function assembleWrangler(
  base: string,
  patches: Readonly<Record<string, unknown>>,
  projectName: string,
): string {
  let out = base;
  // `modify` replaces the value at a top-level key rather than merging, so a
  // patch key must not already exist in the base (today's patches never do).
  for (const [key, value] of Object.entries(patches)) {
    out = applyEdits(
      out,
      modify(out, [key], value, { formattingOptions: FORMATTING }),
    );
  }
  return fillProjectName(out, projectName);
}
