import type { ReactNode } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination.js";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  return (
    <Pagination className="justify-between">
      <span className="text-muted-foreground text-sm">Page {page}</span>
      <PaginationContent>
        <PaginationItem>
          <Button
            variant="ghost"
            size="sm"
            disabled={!canPrev || isLoading}
            onClick={() => {
              onPageChange(page - 1);
            }}
            aria-label="Go to previous page"
          >
            <ChevronLeft />
            <span className="hidden sm:inline">Previous</span>
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
            aria-label="Go to next page"
          >
            <span className="hidden sm:inline">Next</span>
            <ChevronRight />
          </Button>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
