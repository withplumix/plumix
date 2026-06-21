import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";

import { Button } from "@plumix/admin-ui/button";
import { ChevronLeft, ChevronRight } from "@plumix/admin-ui/icons";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@plumix/admin-ui/pagination";

const M = {
  prevAria: defineMessage({
    id: "listPagination.prev.aria",
    message: "Go to previous page",
  }),
  nextAria: defineMessage({
    id: "listPagination.next.aria",
    message: "Go to next page",
  }),
} satisfies Record<string, MessageDescriptor>;

export function ListPagination({
  page,
  canPrev,
  canNext,
  isLoading,
  onPageChange,
}: {
  page: number;
  canPrev: boolean;
  canNext: boolean;
  isLoading: boolean;
  onPageChange: (page: number) => void;
}): ReactNode {
  const label = useLabel();
  return (
    <Pagination className="justify-between">
      <span className="text-muted-foreground text-sm">
        <Trans
          id="listPagination.page"
          message="Page {page}"
          values={{ page }}
          comment="page: 1-based current page number in the list"
        />
      </span>
      <PaginationContent>
        <PaginationItem>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canPrev || isLoading}
            onClick={() => {
              onPageChange(page - 1);
            }}
            aria-label={label(M.prevAria)}
            data-testid="list-pagination-prev"
          >
            <ChevronLeft className="rtl:rotate-180" />
            <span className="hidden sm:inline">
              <Trans id="listPagination.prev.label" message="Previous" />
            </span>
          </Button>
        </PaginationItem>
        <PaginationItem>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canNext || isLoading}
            onClick={() => {
              onPageChange(page + 1);
            }}
            aria-label={label(M.nextAria)}
            data-testid="list-pagination-next"
          >
            <span className="hidden sm:inline">
              <Trans id="listPagination.next.label" message="Next" />
            </span>
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
