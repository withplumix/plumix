import { xmlEscape } from "plumix";

/** Which of the two serializations a request asked for. */
export type FeedFormat = "rss2" | "atom";

export interface FeedItem {
  readonly title: string;
  readonly link: string;
  /** Stable identifier (Atom `<id>`); typically the permalink. */
  readonly id: string;
  /** Last-modified timestamp, ISO-8601. */
  readonly updated: string;
  /** First-published timestamp, ISO-8601. Falls back to `updated`. */
  readonly published?: string;
  readonly summary?: string;
  readonly author?: string;
}

export interface FeedChannel {
  readonly title: string;
  /** The site home URL. */
  readonly link: string;
  /** This feed's own URL (`rel="self"`). */
  readonly feedUrl: string;
  readonly description: string;
  /** Feed-level last-modified timestamp, ISO-8601. */
  readonly updated: string;
}

// RSS2 timestamps are RFC-822; `toUTCString()` produces exactly that shape.
function rfc822(iso: string): string {
  return new Date(iso).toUTCString();
}

export function renderRss2(
  channel: FeedChannel,
  items: readonly FeedItem[],
): string {
  const body = items
    .map((item) => {
      const summary = item.summary
        ? `<description>${xmlEscape(item.summary)}</description>`
        : "";
      const creator = item.author
        ? `<dc:creator>${xmlEscape(item.author)}</dc:creator>`
        : "";
      return (
        `<item>` +
        `<title>${xmlEscape(item.title)}</title>` +
        `<link>${xmlEscape(item.link)}</link>` +
        `<guid isPermaLink="true">${xmlEscape(item.link)}</guid>` +
        `<pubDate>${rfc822(item.published ?? item.updated)}</pubDate>` +
        summary +
        creator +
        `</item>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">` +
    `<channel>` +
    `<title>${xmlEscape(channel.title)}</title>` +
    `<link>${xmlEscape(channel.link)}</link>` +
    `<description>${xmlEscape(channel.description)}</description>` +
    `<atom:link href="${xmlEscape(channel.feedUrl)}" rel="self" type="application/rss+xml"></atom:link>` +
    `<lastBuildDate>${rfc822(channel.updated)}</lastBuildDate>` +
    body +
    `</channel></rss>`
  );
}

export function renderAtom(
  channel: FeedChannel,
  items: readonly FeedItem[],
): string {
  const body = items
    .map((item) => {
      const published = item.published
        ? `<published>${xmlEscape(item.published)}</published>`
        : "";
      const summary = item.summary
        ? `<summary>${xmlEscape(item.summary)}</summary>`
        : "";
      const author = item.author
        ? `<author><name>${xmlEscape(item.author)}</name></author>`
        : "";
      return (
        `<entry>` +
        `<title>${xmlEscape(item.title)}</title>` +
        `<link href="${xmlEscape(item.link)}"></link>` +
        `<id>${xmlEscape(item.id)}</id>` +
        `<updated>${xmlEscape(item.updated)}</updated>` +
        published +
        summary +
        author +
        `</entry>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<feed xmlns="http://www.w3.org/2005/Atom">` +
    `<title>${xmlEscape(channel.title)}</title>` +
    `<link href="${xmlEscape(channel.link)}"></link>` +
    `<link href="${xmlEscape(channel.feedUrl)}" rel="self"></link>` +
    `<id>${xmlEscape(channel.feedUrl)}</id>` +
    `<updated>${xmlEscape(channel.updated)}</updated>` +
    body +
    `</feed>`
  );
}
