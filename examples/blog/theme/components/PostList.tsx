import * as React from "react";
import type { ReactNode } from "react";
import type { ResolvedEntry } from "plumix";

import { PostCard } from "./PostCard";
import { Pagination, type PaginationInfo } from "./Pagination";

// Backs the front page, archive, taxonomy and search; the heading and
// pagination vary per slot.
interface PostListProps {
  readonly entries: readonly ResolvedEntry[];
  readonly heading?: string;
  readonly pagination?: PaginationInfo;
}

export function PostList({
  entries,
  heading,
  pagination,
}: PostListProps): ReactNode {
  return (
    <section data-testid="post-list">
      {heading ? <h1 className="mb-8 font-serif text-2xl">{heading}</h1> : null}
      {entries.length === 0 ? (
        <p className="text-muted" data-testid="post-list-empty">
          No posts yet.
        </p>
      ) : (
        <>
          <div className="grid gap-10 sm:grid-cols-2">
            {entries.map((entry) => (
              <PostCard key={entry.id} entry={entry} />
            ))}
          </div>
          {pagination ? <Pagination {...pagination} /> : null}
        </>
      )}
    </section>
  );
}
