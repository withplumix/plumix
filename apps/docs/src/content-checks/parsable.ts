import type { ContentFile } from "./content-tree";
import type { Finding } from "./finding";

/**
 * Report every file the MDX parser cannot read.
 *
 * This is what every other check's silence rests on: a body that does not
 * parse has no shape, no roster items and no samples, so each of them returns
 * nothing rather than a complaint of its own. Reported once here, and for a
 * fragment as readily as a page — a partial nothing parses is a partial whose
 * samples nothing compiles.
 */
export function checkParsable(files: readonly ContentFile[]): Finding[] {
  return files
    .filter((file) => file.mdast === undefined)
    .map((file) => ({
      file: file.path,
      rule: "parsable/not-mdx",
      message:
        "Could not be parsed as MDX, so nothing in it could be checked. The build reports the syntax error.",
    }));
}
