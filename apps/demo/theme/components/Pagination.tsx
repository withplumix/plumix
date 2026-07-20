import type { Pagination as PaginationData } from "plumix";
import type { ReactNode } from "react";

import { Link } from "@plumix/blocks/renderer";

export interface PaginationInfo {
  // Root-relative request pathname (the base prefix is stripped upstream).
  readonly path: string;
  readonly page: number;
  readonly pageCount: number;
}

export function paginationInfo(
  requestUrl: string,
  pagination: Pick<PaginationData, "page" | "pageCount">,
): PaginationInfo {
  return {
    path: new URL(requestUrl).pathname,
    page: pagination.page,
    pageCount: pagination.pageCount,
  };
}

// Page 1 is the bare listing; later pages append /page/N.
function pageHref(base: string, n: number): string {
  if (n <= 1) return base;
  return base === "/" ? `/page/${n}` : `${base}/page/${n}`;
}

export function Pagination({
  path,
  page,
  pageCount,
}: PaginationInfo): ReactNode {
  if (pageCount <= 1) return null;
  const base = path.replace(/\/page\/\d+$/, "") || "/";

  return (
    <nav
      className="mt-12 flex items-center justify-between text-sm"
      aria-label="Pagination"
      data-testid="pagination"
    >
      {page > 1 ? (
        <Link
          href={pageHref(base, page - 1)}
          className="text-accent hover:underline"
          data-testid="pagination-prev"
        >
          ← Newer
        </Link>
      ) : (
        <span />
      )}
      <span className="text-muted">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link
          href={pageHref(base, page + 1)}
          className="text-accent hover:underline"
          data-testid="pagination-next"
        >
          Older →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
