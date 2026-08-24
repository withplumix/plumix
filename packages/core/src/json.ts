/**
 * Re-export, not a declaration. `@plumix/blocks` needs the JSON type for the
 * stored block tree and cannot import it from here — core depends on blocks,
 * not the other way round — so the single declaration lives at the dependency
 * root and core keeps the spelling every consumer already imports (#1811).
 */
export type { JsonObject, JsonValue } from "@plumix/blocks";
export { isJsonArray, isJsonObject } from "@plumix/blocks";
