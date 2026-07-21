import type {
  ArchiveData,
  AuthorArchiveData,
  DateArchiveData,
  FrontPageData,
  SearchData,
  TaxonomyData,
  TemplateData,
} from "plumix";
import { defineTemplate } from "plumix";

import { Layout } from "../components/Layout";
import { paginationInfo } from "../components/Pagination";
import { PostList } from "../components/PostList";

type ListingData =
  | ArchiveData
  | AuthorArchiveData
  | DateArchiveData
  | FrontPageData
  | SearchData
  | TaxonomyData;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

// A readable heading for a date archive: "2026", "July 2026", "July 21, 2026".
function dateHeading(data: DateArchiveData): string {
  const { year, month, day } = data;
  if (month === null) return String(year);
  const monthName = MONTHS[month - 1] ?? String(month);
  if (day === null) return `${monthName} ${String(year)}`;
  return `${monthName} ${String(day)}, ${String(year)}`;
}

// Title + empty-state copy for each listing node; the front page has neither.
function listingCopy(data: ListingData): {
  heading?: string;
  emptyMessage?: string;
} {
  if ("query" in data) {
    const { total } = data.pagination;
    const noun = total === 1 ? "result" : "results";
    return {
      heading: `${total} ${noun} for "${data.query}"`,
      emptyMessage: `No results for "${data.query}".`,
    };
  }
  if ("term" in data) {
    const label =
      data.taxonomy.charAt(0).toUpperCase() + data.taxonomy.slice(1);
    return { heading: `${label}: ${data.term.name}` };
  }
  if ("contentType" in data) return { heading: "Posts" };
  if ("author" in data) {
    return {
      heading: `Posts by ${data.author.name ?? data.author.slug}`,
      emptyMessage: "No posts by this author yet.",
    };
  }
  if ("year" in data) {
    return {
      heading: dateHeading(data),
      emptyMessage: "No posts from this period.",
    };
  }
  return {};
}

// The `index` slot: renders every listing route as a post list, deriving the
// title from the resolved node (see index.ts for why it's the only listing
// template).
export const fallback = defineTemplate<TemplateData>({
  settings: ["site"],
  menus: ["primary", "footer"],
  render: ({ data, settings, menus, ctx }) => (
    <Layout settings={settings} menus={menus}>
      {"entries" in data ? (
        <PostList
          entries={data.entries}
          {...listingCopy(data)}
          pagination={paginationInfo(ctx.request.url, data.pagination)}
        />
      ) : null}
    </Layout>
  ),
});
