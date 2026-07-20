import * as React from "react";
import type { ReactNode } from "react";
import type { ResolvedEntry } from "plumix";

import { readingTime } from "../reading-time";

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(value);
}

interface PostMetaProps {
  readonly entry: ResolvedEntry;
  readonly className?: string;
}

// The `author · date · reading-time` line, shared by the post card and the
// single-post header. Each present part is joined; an empty line renders
// nothing.
export function PostMeta({ entry, className }: PostMetaProps): ReactNode {
  const parts = [
    entry.author.name,
    formatDate(entry.publishedAt),
    `${readingTime(entry.contentBlocks)} min read`,
  ].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <p className={className} data-testid="post-meta">
      {parts.join(" · ")}
    </p>
  );
}
