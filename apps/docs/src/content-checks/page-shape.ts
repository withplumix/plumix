import type { BodyShape } from "./body-shape";
import type { ContentPage } from "./content-tree";
import type { Finding } from "./finding";
import { readBodyShape } from "./body-shape";

/**
 * Report pages that do not follow the house template: the lede and the
 * mandatory `##` sections named in the documentation IA spec.
 */
export function checkPageShape(pages: readonly ContentPage[]): Finding[] {
  return pages.filter(isDocumentationPage).flatMap(checkPage);
}

function checkPage(page: ContentPage): Finding[] {
  const body = readBodyShape(page.body);
  if (body === undefined) {
    return [
      {
        page: page.path,
        rule: "page-shape/unparsable",
        message:
          "Could not be parsed as MDX, so its shape could not be checked. The build reports the syntax error.",
      },
    ];
  }

  const sections = new Set(
    body.headings
      .filter((heading) => heading.depth === 2)
      .map((heading) => heading.text),
  );

  const findings: Finding[] = [];

  if (!body.hasLede) {
    findings.push({
      page: page.path,
      rule: "page-shape/missing-lede",
      message:
        "Missing the lede: one or two sentences of prose between the frontmatter and the first `##` heading.",
    });
  }

  for (const section of MANDATORY_SECTIONS) {
    if (sections.has(section.heading) || section.exempt?.(page, body)) continue;
    findings.push({
      page: page.path,
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
  readonly exempt?: (page: ContentPage, body: BodyShape) => boolean;
}

/** The house template's mandatory `##` sections. Presence only — not order. */
const MANDATORY_SECTIONS: readonly MandatorySection[] = [
  {
    heading: "Overview",
    rule: "page-shape/missing-overview",
    message: "Missing the mandatory `## Overview` section.",
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
function isDocumentationPage(page: ContentPage): boolean {
  return page.frontmatter.template !== "splash";
}

/**
 * The quickstart exemption: a page opts in with `roster: true` and must then
 * actually enumerate something. The spec's other half — every item carrying
 * its own example — is not enforced here, because an item that is a pure
 * variant of a documented sibling legitimately links to the sibling's example
 * instead of repeating it.
 */
function isRoster(page: ContentPage, body: BodyShape): boolean {
  return (
    page.frontmatter.roster === true &&
    body.headings.some((heading) => heading.depth === 3)
  );
}
