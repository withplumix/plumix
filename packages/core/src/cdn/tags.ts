import type { RouteIntent } from "../route/contract/intent.js";
import type { ResolvedEntity } from "../route/contract/resolved-entity.js";
import { entryTag, typeTag } from "./contract/tags.js";

interface PageTagSources {
  readonly intent: RouteIntent;
  readonly resolvedEntity: ResolvedEntity | null;
  readonly frontPageEntryTypes: () => readonly string[];
  readonly taxonomyEntryTypes: (taxonomy: string) => readonly string[];
}

/**
 * A permalink carries `t:X` too, since it can render sibling content like
 * related posts; its own `e:<id>` lets an edit purge it precisely.
 */
export function pageTags(sources: PageTagSources): string[] {
  const { intent, resolvedEntity } = sources;
  switch (intent.kind) {
    case "entry":
      return resolvedEntity?.kind === "entry"
        ? [typeTag(intent.entryType), entryTag(resolvedEntity.id)]
        : [];
    case "entryType":
      return [typeTag(intent.entryType)];
    case "frontPage":
      return sources.frontPageEntryTypes().map(typeTag);
    case "term":
      return sources.taxonomyEntryTypes(intent.taxonomy).map(typeTag);
    case "author":
    case "date":
      // Author and date archives list the same public, non-hierarchical type
      // set as the front page, so any publish of those types can change them.
      return sources.frontPageEntryTypes().map(typeTag);
    case "archiveType":
    case "view":
    case "search":
      // Not derivable from the intent; these contribute their tags per request.
      return [];
  }
}
