// Small helpers, one leaf module each, so a browser bundle can take them
// without the root barrel's `node:async_hooks` import.
export { normalizeBasePath, withBasePath } from "./base-path.js";
export { escapeHtml } from "./escape-html.js";
export { nonEmpty } from "./non-empty.js";
export { isJsonArray, isJsonObject } from "./json.js";
export type { JsonObject, JsonValue } from "./json.js";
export { escapeLikePattern } from "./search/contract/search-terms.js";
export { xmlEscape } from "./seo/contract/xml.js";
export { slugify } from "./slugify.js";
export { viewTransitionTypes } from "./view-transition.js";
export type { ViewTransitionType } from "./view-transition.js";
