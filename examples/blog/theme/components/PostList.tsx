import * as React from "react";
import type { ReactNode } from "react";
import type { ResolvedEntry } from "plumix";

import { PostCard } from "./PostCard";

// Backs the front page, archive, taxonomy and search; the heading varies
// per slot.
interface PostListProps {
  readonly entries: readonly ResolvedEntry[];
  readonly heading?: string;
}

export function PostList({ entries, heading }: PostListProps): ReactNode {
  return (
    <section data-testid="post-list">
      {heading ? <h1 className="mb-8 font-serif text-2xl">{heading}</h1> : null}
      {entries.length === 0 ? (
        <p className="text-muted" data-testid="post-list-empty">
          No posts yet.
        </p>
      ) : (
        <div className="grid gap-10 sm:grid-cols-2">
          {entries.map((entry) => (
            <PostCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </section>
  );
}
