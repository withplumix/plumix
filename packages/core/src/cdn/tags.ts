import type { RouteIntent } from "../route/contract/intent.js";
import type { ResolvedEntity } from "../route/contract/resolved-entity.js";
import type { CacheRead } from "./contract/subjects.js";

interface PageReadSources {
  readonly intent: RouteIntent;
  readonly resolvedEntity: ResolvedEntity | null;
  /** Entry types the front page lists (public, non-hierarchical). */
  readonly frontPageEntryTypes: () => readonly string[];
}

/**
 * What a rendered public page read by being the route it is. Every page that
 * lists or embeds type-`X` content — its archives, the front page, term
 * archives, and an entry permalink (which can render sibling content like
 * related posts) — reads type `X`, so any publish of that type reaches it. A
 * permalink also reads its own entry, so an edit to just that entry reaches
 * it precisely.
 */
export function pageReads(sources: PageReadSources): CacheRead[] {
  const { intent, resolvedEntity } = sources;
  switch (intent.kind) {
    case "entry":
      return resolvedEntity?.kind === "entry"
        ? [
            { kind: "entryType", type: intent.entryType },
            { kind: "entry", id: resolvedEntity.id },
          ]
        : [];
    case "entryType":
      return [{ kind: "entryType", type: intent.entryType }];
    case "frontPage":
    case "author":
    case "date":
      // Author and date archives list the same public, non-hierarchical type
      // set as the front page, so any publish of those types can change them.
      return sources
        .frontPageEntryTypes()
        .map((type): CacheRead => ({ kind: "entryType", type }));
    case "term":
      return [{ kind: "taxonomy", taxonomy: intent.taxonomy }];
    case "archiveType":
    case "view":
    case "search":
      // Neither is derivable from the intent alone: search results depend on a
      // query, and a plugin archive's content on what it registered. Both
      // record their reads per request instead — a listed archive's from the
      // types its entry query can list, an unlisted one's from whatever its
      // resolver returns. A view is an unlisted resolver's page too.
      return [];
  }
}
