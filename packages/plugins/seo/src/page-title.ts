import type { PageFacts, TemplateData } from "plumix";

import type { SeoSettings } from "./settings.js";
import type { TitleVariables } from "./title-pattern.js";
import { scopedType } from "./scope.js";
import { renderTitlePattern } from "./title-pattern.js";

export interface TitleVariableInput {
  readonly facts: PageFacts;
  /**
   * Supplies the result count and date period, which `PageFacts` doesn't hold.
   */
  readonly data: TemplateData;
  /** The title core resolved for this page. */
  readonly title: string;
  readonly siteName: string | null;
  readonly separator: string;
  readonly localeCode: string;
}

// A period is a calendar span, not an instant: anchoring at UTC and formatting
// there keeps `2026/01` from printing as December in a negative offset.
function formatUtc(
  date: Date,
  localeCode: string,
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(localeCode, {
    ...options,
    timeZone: "UTC",
  }).format(date);
}

// An archive prints exactly the parts it covers, so the options it formats
// with are the arguments it was given.
function formatPeriod(
  year: number,
  month: number | null,
  day: number | null,
  localeCode: string,
): string {
  const anchor = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
  return formatUtc(anchor, localeCode, {
    year: "numeric",
    ...(month === null ? {} : { month: "long" }),
    ...(day === null ? {} : { day: "numeric" }),
  });
}

function resultCount(data: TemplateData): string {
  switch (data.kind) {
    case "entryType":
    case "term":
    case "author":
    case "date":
    case "frontPage":
    case "search":
      return String(data.pagination.total);
    case "entry":
    case "archiveType":
    case "view":
    case "error":
      return "";
  }
}

function periodOf(data: TemplateData, localeCode: string): string {
  return data.kind === "date"
    ? formatPeriod(data.year, data.month, data.day, localeCode)
    : "";
}

/** A variable the page has nothing for is "", so patterns degrade cleanly. */
export function titleVariables(input: TitleVariableInput): TitleVariables {
  const { facts, data, localeCode } = input;
  const author = facts.author;
  return {
    title: input.title,
    sitename: input.siteName ?? "",
    sep: input.separator,
    term: facts.term?.name ?? "",
    author: author ? (author.name ?? author.slug) : "",
    // An entry is dated by its own publication; a date archive by the span it
    // covers. Nothing else has a date to print.
    date:
      facts.published === null
        ? periodOf(data, localeCode)
        : formatUtc(facts.published, localeCode, { dateStyle: "long" }),
    searchphrase: facts.query ?? "",
    count: resultCount(data),
  };
}

/**
 * Null when no pattern applies or every variable is empty. A type's pattern
 * covers its entries and archive; everything else uses the site-wide one.
 */
export function patternTitle(
  settings: SeoSettings,
  input: Omit<TitleVariableInput, "separator">,
): string | null {
  const type = scopedType(input.facts);
  const pattern =
    (type === null ? undefined : settings.typeTitlePatterns.get(type)) ??
    settings.titlePattern;
  if (pattern === null) return null;
  return renderTitlePattern(pattern, {
    ...titleVariables({ ...input, separator: settings.separator }),
  });
}
