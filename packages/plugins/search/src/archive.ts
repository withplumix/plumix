import type { CustomArchiveData, PluginSetupContext } from "plumix/plugin";
import {
  FRAMEWORK_SEARCH_PAGINATED_PATTERN,
  FRAMEWORK_SEARCH_QUERY_PATTERN,
  withBasePath,
} from "plumix";

import type { RankingAlgorithm } from "./ranking.js";
import type { SearchResult } from "./server/query.js";
import { runSearch } from "./server/query.js";

const SEARCH_ARCHIVE_NAME = "search";

// Core's own search rules sit at priority 5, and lower wins. Claiming their
// patterns below that is what replaces the page; core's rules stay compiled
// behind these, so uninstalling the plugin restores them with nothing to undo.
const SHADOW_PRIORITY = 1;

/** What the theme renders a search page from. */
export interface SearchArchiveData extends CustomArchiveData {
  readonly kind: "custom";
  readonly name: "search";
  /** What the visitor typed, decoded — for the heading and the input. */
  readonly query: string;
  readonly results: readonly SearchResult[];
  /**
   * Where the next page of results lives, or `null` at the end. Opaque on
   * purpose — a theme renders it, never builds it, so what paginating means
   * can change without the payload changing shape.
   */
  readonly nextUrl: string | null;
}

declare module "plumix" {
  interface ArchiveTypeRegistry {
    search: { data: SearchArchiveData };
  }
}

function pageUrl(
  appCtx: Parameters<typeof runSearch>[0],
  query: string,
  page: number,
): string {
  return withBasePath(
    `/search/${encodeURIComponent(query)}/page/${String(page)}`,
    appCtx.basePath,
  );
}

function decodeQuery(raw: string | undefined): string {
  if (raw === undefined) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    // A stray percent sign is a visitor's typo. Search for nothing rather than
    // failing the request, the same answer an unbalanced quote gets.
    return "";
  }
}

/**
 * Replace core's search page with one backed by the index.
 *
 * The bare `/search` stays core's on purpose. A plain HTML form submits
 * `GET /search?q=…`, and core answers it with a 301 to the canonical
 * `/search/<q>` — which lands back here. An archive resolver returns a payload
 * or a 404 and has no way to redirect, so taking that path would cost the
 * no-JavaScript form its canonical URL.
 */
export function registerSearchArchive(
  ctx: PluginSetupContext,
  ranking: RankingAlgorithm | undefined,
): void {
  ctx.registerArchiveType(SEARCH_ARCHIVE_NAME, {
    routes: [
      FRAMEWORK_SEARCH_PAGINATED_PATTERN,
      FRAMEWORK_SEARCH_QUERY_PATTERN,
    ],
    priority: SHADOW_PRIORITY,
    // Not `cacheable`, for the reason core gives for leaving its own search
    // page out of the edge cache: the query space is unbounded, so every
    // distinct string a crawler tries would mint an entry keyed on that URL.
    resolve: async (appCtx, params) => {
      const query = decodeQuery(params.query);
      const page = Number(params.page ?? 1);
      const { results, hasMore, outOfRange } = await runSearch(appCtx, {
        query,
        page,
        ranking,
      });
      // Core 404s a search page past the end of its results, and an infinite
      // tail of empty pages is worth no less here.
      if (outOfRange) return null;
      return {
        data: {
          kind: "custom",
          name: SEARCH_ARCHIVE_NAME,
          query,
          results,
          nextUrl: hasMore ? pageUrl(appCtx, query, page + 1) : null,
        } satisfies SearchArchiveData,
        title: query === "" ? "Search" : `Search: ${query}`,
      };
    },
  });
}
