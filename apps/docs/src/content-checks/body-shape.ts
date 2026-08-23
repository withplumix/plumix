import type { Heading } from "mdast";
import remarkMdx from "remark-mdx";
import remarkParse from "remark-parse";
import { unified } from "unified";

export interface BodyShape {
  /** Whether a paragraph precedes the first heading. */
  readonly hasLede: boolean;
  /** Headings at the top level of the document, in source order. */
  readonly headings: readonly { depth: number; text: string }[];
}

const mdx = unified().use(remarkParse).use(remarkMdx);

/**
 * Parse the body rather than scan its lines. MDX opens a page with `import`
 * statements and JSX elements — both of which span lines and both of which a
 * line scanner mistakes for the prose a page owes its reader. A `##` inside a
 * code fence is text, not a section, for the same reason.
 *
 * `undefined` when the body is not MDX at all: a run has to report every
 * offending page, so one unparsable page cannot take the whole run down.
 */
export function readBodyShape(source: string): BodyShape | undefined {
  let children;
  try {
    children = mdx.parse(source).children;
  } catch {
    return undefined;
  }

  const firstHeading = children.findIndex((node) => node.type === "heading");
  const lede = firstHeading === -1 ? children : children.slice(0, firstHeading);

  return {
    hasLede: lede.some((node) => node.type === "paragraph"),
    headings: children
      .filter((node) => node.type === "heading")
      .map((heading) => ({ depth: heading.depth, text: text(heading) })),
  };
}

function text(heading: Heading): string {
  return heading.children
    .map((child) => ("value" in child ? child.value : ""))
    .join("")
    .trim();
}
