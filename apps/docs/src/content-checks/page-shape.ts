import type { BodyShape } from "./body-shape";
import type { ContentFile } from "./content-tree";
import type { Finding } from "./finding";
import { readBodyShape } from "./body-shape";

/**
 * Report pages that do not follow the house template: the lede and the
 * mandatory `##` sections named in the documentation IA spec.
 *
 * A fragment is skipped outright. It has no URL, so it is not a page a reader
 * arrives at — it legitimately carries no lede and none of the four sections,
 * and holding it to a template written for pages would report every partial in
 * the tree.
 */
export function checkPageShape(files: readonly ContentFile[]): Finding[] {
  return files
    .filter((file) => file.kind === "page")
    .filter(isDocumentationPage)
    .flatMap(checkPage);
}

function checkPage(page: ContentFile): Finding[] {
  // Reported by `checkParsable`.
  if (page.mdast === undefined) return [];

  const body = readBodyShape(page.mdast);

  const sections = new Set(
    body.headings
      .filter((heading) => heading.depth === 2)
      .map((heading) => heading.text),
  );

  const findings: Finding[] = [];

  if (!body.hasLede) {
    findings.push({
      file: page.path,
      rule: "page-shape/missing-lede",
      message:
        "Missing the lede: one or two sentences of prose between the frontmatter and the first `##` heading.",
    });
  }

  for (const section of MANDATORY_SECTIONS) {
    if (sections.has(section.heading) || section.exempt?.(page, body)) continue;
    findings.push({
      file: page.path,
      rule: section.rule,
      message: section.message,
    });
  }

  return findings;
}

interface MandatorySection {
  readonly heading: string;
  readonly rule: string;
  readonly message: string;
  /** Pages that earn their way out of carrying this section. */
  readonly exempt?: (page: ContentFile, body: BodyShape) => boolean;
}

/** The house template's mandatory `##` sections. Presence only — not order. */
const MANDATORY_SECTIONS: readonly MandatorySection[] = [
  {
    heading: "Overview",
    rule: "page-shape/missing-overview",
    message:
      "Missing the mandatory `## Overview` section. Only a section landing page — one whose own title is already `Overview` — is exempt.",
    exempt: isSectionLanding,
  },
  {
    heading: "Quickstart",
    rule: "page-shape/missing-quickstart",
    message:
      "Missing the mandatory `## Quickstart` section. Only a roster page — `roster: true` in frontmatter, enumerating `###` items — is exempt.",
    exempt: isRoster,
  },
  {
    heading: "Related",
    rule: "page-shape/missing-related",
    message: "Missing the mandatory `## Related` section.",
  },
  {
    heading: "Next steps",
    rule: "page-shape/missing-next-steps",
    message: "Missing the mandatory `## Next steps` section.",
  },
];

/**
 * A splash page is Starlight's own declaration that a page is a landing page
 * rather than a documentation page, so the house template does not apply. It
 * cannot be claimed quietly: splash drops the sidebar and the table of
 * contents, so a page wearing it to dodge this check looks nothing like a
 * documentation page either.
 */
function isDocumentationPage(page: ContentFile): boolean {
  return page.frontmatter.template !== "splash";
}

/**
 * The overview exemption: a page whose `<h1>` already reads "Overview" is its
 * section's landing page, so a `## Overview` under it renders the word twice in
 * a row and adds a heading that repeats the title. The page is the overview.
 */
function isSectionLanding(page: ContentFile): boolean {
  return page.frontmatter.title === "Overview";
}

/**
 * The quickstart exemption: a page opts in with `roster: true` and must then
 * actually enumerate something. The spec's other half — every item carrying
 * its own example — is not enforced here, because an item that is a pure
 * variant of a documented sibling legitimately links to the sibling's example
 * instead of repeating it.
 */
function isRoster(page: ContentFile, body: BodyShape): boolean {
  return (
    page.frontmatter.roster === true &&
    body.headings.some((heading) => heading.depth === 3)
  );
}
