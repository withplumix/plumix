import * as React from "react";
import type { ReactNode } from "react";
import type { ResolvedEntry } from "plumix";
import { BlockRenderer, Link } from "@plumix/blocks/renderer";

import { FeaturedImage } from "./FeaturedImage";
import { PostMeta } from "./PostMeta";

interface PostSingleProps {
  readonly entry: ResolvedEntry;
  readonly showMeta?: boolean;
}

export function PostSingle({
  entry,
  showMeta = true,
}: PostSingleProps): ReactNode {
  const tags = entry.terms.filter((term) => term.taxonomy === "tag");

  return (
    <article data-testid="post-single">
      <FeaturedImage entry={entry} priority className="mb-8" />

      <header className="mb-8">
        <h1
          className="font-serif text-3xl leading-tight"
          data-testid="post-title"
        >
          {entry.title}
        </h1>
        {showMeta ? (
          <PostMeta entry={entry} className="mt-3 text-sm text-muted" />
        ) : null}
        {entry.excerpt ? (
          <p className="mt-4 text-lg text-muted">{entry.excerpt}</p>
        ) : null}
      </header>

      <div
        className="prose prose-stone max-w-none prose-headings:font-serif"
        data-testid="post-body"
      >
        {entry.contentBlocks ? (
          <BlockRenderer content={entry.contentBlocks} />
        ) : null}
      </div>

      {showMeta && tags.length > 0 ? (
        <div className="mt-10 flex flex-wrap gap-2" data-testid="post-tags">
          {tags.map((tag) => (
            <Link
              key={tag.id}
              term={tag}
              className="rounded border border-line px-2.5 py-0.5 text-sm text-muted hover:text-ink"
            >
              {tag.name}
            </Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}
