import * as React from "react";
import type { ReactNode } from "react";
import type { ResolvedEntry } from "plumix";
import { BlockRenderer } from "@plumix/blocks/renderer";

import { FeaturedImage } from "./FeaturedImage";
import { PostMeta } from "./PostMeta";

interface PostSingleProps {
  readonly entry: ResolvedEntry;
}

export function PostSingle({ entry }: PostSingleProps): ReactNode {
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
        <PostMeta entry={entry} className="mt-3 text-sm text-muted" />
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
