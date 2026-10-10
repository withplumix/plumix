import type { ResolvedEntry } from "plumix/theme";
import type { ReactNode } from "react";

import { PostCard } from "./PostCard";

interface RelatedPostsProps {
  readonly entries: readonly ResolvedEntry[];
}

/**
 * An empty list means nothing related, so the strip is hidden rather than
 * shown empty.
 */
export function RelatedPosts({ entries }: RelatedPostsProps): ReactNode {
  if (entries.length === 0) return null;
  return (
    <section
      className="border-line mt-16 border-t pt-8"
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
