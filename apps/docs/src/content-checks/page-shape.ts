import type { BodyShape } from "./body-shape";
import type { ContentFile } from "./content-tree";
import type { Finding } from "./finding";
import { readBodyShape } from "./body-shape";

/**
 * Skips fragments: a partial has no URL, so it legitimately carries no lede or
 * sections.
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
  readonly exempt?: (page: ContentFile, body: BodyShape) => boolean;
}

// Presence only, not order.
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

// Splash cannot be claimed quietly to dodge the template: it drops the sidebar
// and table of contents.
function isDocumentationPage(page: ContentFile): boolean {
  return page.frontmatter.template !== "splash";
}

// A `## Overview` under an `<h1>` reading "Overview" would repeat the title.
function isSectionLanding(page: ContentFile): boolean {
  return page.frontmatter.title === "Overview";
}

// Items are not required to carry their own example: a pure variant may link to
// its sibling's.
function isRoster(page: ContentFile, body: BodyShape): boolean {
  return (
    page.frontmatter.roster === true &&
    body.headings.some((heading) => heading.depth === 3)
  );
}
