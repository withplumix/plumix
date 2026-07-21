import type { ResolvedEntry } from "plumix";
import type { ReactNode } from "react";
import { Fragment } from "react";

import { Link } from "@plumix/blocks/renderer";

import { readingTime } from "../reading-time";

function formatDate(value: Date | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(value);
}

// The day-archive path for a date, e.g. `/2026/07/21` (UTC, zero-padded to
// match the `/YYYY/MM/DD` route).
function dayArchivePath(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `/${String(year)}/${month}/${day}`;
}

interface PostMetaProps {
  readonly entry: ResolvedEntry;
  readonly className?: string;
}

// The `author · date · reading-time` line, shared by the post card and the
// single-post header. The author links to their archive (`/authors/{slug}`) and
// the date to its day archive (`/YYYY/MM/DD`); each part is separated by a
// middot.
export function PostMeta({ entry, className }: PostMetaProps): ReactNode {
  const date = formatDate(entry.publishedAt);
  const parts: { readonly key: string; readonly node: ReactNode }[] = [];
  if (entry.author.name) {
    parts.push({
      key: "author",
      node: (
        <Link
          href={`/authors/${entry.author.slug}`}
          className="hover:text-accent"
          data-testid="post-meta-author"
        >
          {entry.author.name}
        </Link>
      ),
    });
  }
  if (date && entry.publishedAt) {
    parts.push({
      key: "date",
      node: (
        <Link
          href={dayArchivePath(entry.publishedAt)}
          className="hover:text-accent"
          data-testid="post-meta-date"
        >
          {date}
        </Link>
      ),
    });
  }
  parts.push({
    key: "reading",
    node: `${readingTime(entry.contentBlocks)} min read`,
  });
  return (
    <p className={className} data-testid="post-meta">
      {parts.map((part, i) => (
        <Fragment key={part.key}>
          {i > 0 ? " · " : null}
          {part.node}
        </Fragment>
      ))}
    </p>
  );
}
