import type { ArchiveTypeData } from "plumix";
import type { PluginSetupContext } from "plumix/plugin";
import {
  FRAMEWORK_SEARCH_PAGINATED_PATTERN,
  FRAMEWORK_SEARCH_QUERY_PATTERN,
} from "plumix/plugin";
import { withBasePath } from "plumix/support";

import type { SearchOptions, SearchResult } from "./server/query.js";
import { runSearch } from "./server/query.js";

const SEARCH_ARCHIVE_NAME = "search";

/**
 * Core's search rules sit at priority 5 and lower wins, so these shadow them
 * while core's stay compiled behind, restored on uninstall with nothing to
 * undo.
 */
const SHADOW_PRIORITY = 1;

/** What the theme renders a search page from. */
export interface SearchArchiveData extends ArchiveTypeData {
  readonly kind: "archiveType";
  readonly name: "search";
  /**
   * Required here, unlike the base, so a theme never handles `undefined`.
   * `query` is decoded.
   */
  readonly page: number;
  readonly query: string;
  readonly results: readonly SearchResult[];
  /**
   * `null` at the end. Opaque so a theme renders it, never builds it, and
   * pagination can change shape freely.
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
    appCtx.config.basePath,
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
 * Leaves bare `/search` to core: core 301s a form's `?q=` to `/search/<q>`,
 * and an archive resolver cannot redirect.
 */
export function registerSearchArchive(
  ctx: PluginSetupContext,
  options: Pick<SearchOptions, "ranking" | "commonTermThreshold">,
): void {
  ctx.registerArchiveType(SEARCH_ARCHIVE_NAME, {
    routes: [
      FRAMEWORK_SEARCH_PAGINATED_PATTERN,
      FRAMEWORK_SEARCH_QUERY_PATTERN,
    ],
    priority: SHADOW_PRIORITY,
    // Not `cacheable`: the query space is unbounded, so every string a crawler
    // tries would mint a CDN entry.
    resolve: async (appCtx, params) => {
      const query = decodeQuery(params.query);
      const page = Number(params.page ?? 1);
      const { results, hasMore, outOfRange } = await runSearch(appCtx, {
        query,
        page,
        ...options,
      });
      // Core 404s a search page past the end of its results, and an infinite
      // tail of empty pages is worth no less here.
      if (outOfRange) return null;
      return {
        data: {
          kind: "archiveType",
          name: SEARCH_ARCHIVE_NAME,
          page,
          query,
          results,
          nextUrl: hasMore ? pageUrl(appCtx, query, page + 1) : null,
        } satisfies SearchArchiveData,
        title: query === "" ? "Search" : `Search: ${query}`,
      };
    },
  });
}
