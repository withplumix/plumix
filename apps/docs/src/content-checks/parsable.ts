import type { ContentFile } from "./content-tree";
import type { Finding } from "./finding";

/**
 * Every other check skips an unparsable body silently and relies on this one to
 * report it.
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
