import type { ContentFile } from "./content-tree";
import type { Finding } from "./finding";
import { readBodyShape } from "./body-shape";

/** A roster page and the item ids its source says it must enumerate. */
export interface Roster {
  /** Path of the roster page, relative to the content root. */
  readonly page: string;
  /**
   * Every item id the page owes its reader. Held once, in `rosters.ts`, and
   * bound to the source there — see that file for the pattern.
   */
  readonly items: readonly string[];
}

/**
 * Report roster pages that disagree with their source: an item the source
 * lists and the page never documents, or an item the page documents that the
 * source has never had.
 *
 * On a roster page every `###` heading is an item — that is what makes the
 * second direction checkable at all. Structure inside an item nests deeper.
 *
 * A roster whose page is not in the tree yet is not drift. Most of the site is
 * unwritten, and a guard that fires on every unwritten page reports nothing
 * useful — the binding takes hold the moment the page exists. The cost of that
 * is a mistyped path looking exactly like an unwritten page, which is why a
 * written roster page no entry claims is reported in its own right.
 *
 * Pages only. A roster is a page's promise to its reader that this is all of
 * them, and a fragment has no reader of its own to promise anything to — so a
 * roster enumerates its items in its own body rather than assembling them out
 * of partials, and the `###` headings read here are the page's own.
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
