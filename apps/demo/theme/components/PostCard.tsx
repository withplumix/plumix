import type { ResolvedEntry } from "plumix";
import type { ReactNode } from "react";

import { Link } from "@plumix/blocks/renderer";

import { FeaturedImage } from "./FeaturedImage";
import { PostMeta } from "./PostMeta";

interface PostCardProps {
  readonly entry: ResolvedEntry;
}

export function PostCard({ entry }: PostCardProps): ReactNode {
  return (
    <article data-testid="post-card">
      <Link entry={entry} className="block">
        <FeaturedImage entry={entry} placeholder className="mb-4" />
      </Link>
      <h2 className="font-serif text-xl leading-snug">
        <Link
          entry={entry}
          className="hover:text-accent"
          data-testid="post-card-title"
        >
          {entry.title}
        </Link>
      </h2>
      {entry.excerpt ? (
        <p className="text-muted mt-2">{entry.excerpt}</p>
      ) : null}
      <PostMeta entry={entry} className="text-muted mt-3 text-sm" />
    </article>
  );
}
