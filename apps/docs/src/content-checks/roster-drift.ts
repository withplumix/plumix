import type { ContentFile } from "./content-tree";
import type { Finding } from "./finding";
import { readBodyShape } from "./body-shape";

/** A roster page and the item ids its source says it must enumerate. */
export interface Roster {
  /** Path of the roster page, relative to the content root. */
  readonly page: string;
  readonly items: readonly string[];
}

/**
 * Every `###` on a roster page is an item. A roster whose page does not exist
 * yet is skipped, so a written `roster: true` page no entry claims is reported
 * instead.
 */
export function checkRosterDrift(
  files: readonly ContentFile[],
  rosters: readonly Roster[],
): Finding[] {
  const pages = files.filter((file) => file.kind === "page");
  const byPath = new Map(pages.map((page) => [page.path, page]));
  const claimed = new Set(rosters.map((roster) => roster.page));

  return [
    ...rosters.flatMap((roster) => {
      const page = byPath.get(roster.page);
      return page === undefined ? [] : checkRoster(roster, page);
    }),
    ...pages
      .filter((page) => isRoster(page) && !claimed.has(page.path))
      .map((page) => ({
        file: page.path,
        rule: "roster-drift/unregistered-page",
        message:
          "Declares `roster: true`, but no entry in `src/content-checks/rosters.ts` claims it — so nothing holds it to its source. Register it, or drop the frontmatter if the page promises no closed set.",
      })),
  ];
}

function isRoster(page: ContentFile): boolean {
  return page.frontmatter.roster === true;
}

function checkRoster(roster: Roster, page: ContentFile): Finding[] {
  // Reported by `checkParsable`.
  if (page.mdast === undefined) return [];

  const body = readBodyShape(page.mdast);

  const documented = new Set(
    body.headings
      .filter((heading) => heading.depth === 3)
      .map((heading) => heading.text),
  );
  const expected = new Set(roster.items);

  return [
    ...roster.items
      .filter((item) => !documented.has(item))
      .map((item) => ({
        file: page.path,
        rule: "roster-drift/missing-item",
        message: `The roster is short of \`${item}\`, which its source lists. Document it as a \`###\` heading, or drop it from this roster's items in \`src/content-checks/rosters.ts\`.`,
      })),
    ...[...documented]
      .filter((item) => !expected.has(item))
      .map((item) => ({
        file: page.path,
        rule: "roster-drift/unknown-item",
        message: `The roster documents \`${item}\`, which its source does not list. Remove it, or add it to this roster's items in \`src/content-checks/rosters.ts\` — where a source binding decides whether it belongs.`,
      })),
  ];
}
