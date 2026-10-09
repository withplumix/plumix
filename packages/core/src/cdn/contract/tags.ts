// A cache tag's one spelling, applied wherever a tag enters the system: the
// rule in `plugin/cache-tags.ts`, the page-tag accumulator, the purge
// accumulator and the request memo. So a stored tag and its purge cannot
// disagree, and neither can a memo entry and the write that drops it.
//
// A `contract/` half because two layers speak it: the CDN stores and purges
// pages by these tags, and the request memo (`context/`, a layer below) drops
// the entries a write announced through them (#2517).

/**
 * At least one target CDN (Netlify) matches tags case-insensitively, so
 * `t:Post` and `t:post` would be two tags on one vendor and one on another —
 * a collision that only ever appears on the vendor the site did not develop
 * against.
 */
export function normalizeTag(tag: string): string {
  return tag.toLowerCase();
}
