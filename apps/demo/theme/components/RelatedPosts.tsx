import * as React from "react";
import type { ReactNode } from "react";
import type { ResolvedEntry } from "plumix";

import { PostCard } from "./PostCard";

interface RelatedPostsProps {
  readonly entries: readonly ResolvedEntry[];
}

// Sits below the article (and its comments) on the single-post view. The
// `relatedPosts` dep returns posts sharing a term with the current one, so an
// empty list means nothing related — hide the strip rather than show it.
export function RelatedPosts({ entries }: RelatedPostsProps): ReactNode {
  if (entries.length === 0) return null;
  return (
    <section
      className="mt-16 border-t border-line pt-8"
      data-testid="related-posts"
    >
      <h2 className="font-serif text-2xl">Related posts</h2>
      <div className="mt-6 grid gap-10 sm:grid-cols-3">
        {entries.map((entry) => (
          <PostCard key={entry.id} entry={entry} />
        ))}
      </div>
    </section>
  );
}
