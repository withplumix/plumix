import * as React from "react";
import type { ReactNode } from "react";
import type { ResolvedEntry } from "plumix";
import { BlockRenderer, Image } from "@plumix/blocks/renderer";

import { readingTime } from "../reading-time";

// Forward-looking contract: a featured image seeded onto the post's `meta`
// renders here; the admin affordance to set one lands in a later slice.
interface FeaturedImage {
  readonly src?: string;
  readonly alt?: string;
  readonly width?: number;
  readonly height?: number;
}

interface PostSingleProps {
  readonly entry: ResolvedEntry;
}

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(value);
}

export function PostSingle({ entry }: PostSingleProps): ReactNode {
  const featured = entry.meta?.featuredImage as FeaturedImage | undefined;
  const featuredSrc = featured?.src;
  const meta = [
    entry.author.name,
    formatDate(entry.publishedAt),
    `${readingTime(entry.contentBlocks)} min read`,
  ].filter(Boolean);

  return (
    <article data-testid="post-single">
      {featuredSrc && featured?.width && featured?.height ? (
        <div className="mb-8">
          <Image
            src={featuredSrc}
            alt={featured.alt ?? ""}
            width={featured.width}
            height={featured.height}
            priority
          />
        </div>
      ) : null}

      <header className="mb-8">
        <h1
          className="font-serif text-3xl leading-tight"
          data-testid="post-title"
        >
          {entry.title}
        </h1>
        {meta.length > 0 ? (
          <p className="mt-3 text-sm text-muted" data-testid="post-meta">
            {meta.join(" · ")}
          </p>
        ) : null}
        {entry.excerpt ? (
          <p className="mt-4 text-lg text-muted">{entry.excerpt}</p>
        ) : null}
      </header>

      <div className="space-y-4 leading-relaxed" data-testid="post-body">
        {entry.contentBlocks ? (
          <BlockRenderer content={entry.contentBlocks} />
        ) : null}
      </div>
    </article>
  );
}
