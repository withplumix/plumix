import * as React from "react";
import type { ReactNode } from "react";
import type { ResolvedEntry } from "plumix";
import { Link } from "@plumix/blocks/renderer";

// Slice 1 renders a bare list of linked titles. The card grid + meta
// (PostCard) lands in a later slice; everything that lists posts —
// front page, archive, taxonomy, search — funnels through here.
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
        <ul className="space-y-4">
          {entries.map((entry) => (
            <li key={entry.id}>
              <Link
                entry={entry}
                className="font-serif text-lg hover:text-accent"
                data-testid="post-list-item"
              >
                {entry.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
