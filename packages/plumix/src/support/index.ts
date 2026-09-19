// Through `@plumix/core/support`, never the root barrel, so an admin chunk or
// an island can import this subpath too.
export {
  escapeHtml,
  escapeLikePattern,
  isJsonArray,
  isJsonObject,
  nonEmpty,
  normalizeBasePath,
  slugify,
  withBasePath,
  xmlEscape,
} from "@plumix/core/support";

export type { JsonObject, JsonValue } from "@plumix/core/support";
