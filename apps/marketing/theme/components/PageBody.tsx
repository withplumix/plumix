import type { ResolvedEntry } from "plumix/theme";
import type { ReactNode } from "react";
import { BlockRenderer } from "plumix/blocks/renderer";

export function PageBody({
  entry,
}: {
  readonly entry: ResolvedEntry;
}): ReactNode {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16" data-testid="page-body">
      <h1 className="font-serif text-4xl leading-tight md:text-5xl">
        {entry.title}
      </h1>
      <div className="prose prose-stone mt-10 max-w-none">
        {entry.contentBlocks ? (
          <BlockRenderer content={entry.contentBlocks} />
        ) : null}
      </div>
    </article>
  );
}
